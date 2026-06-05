package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const version = "1.0.1"

type Config struct {
	AgentID         string   `json:"agent_id"`
	LinkName        string   `json:"link_name"`
	Interface       string   `json:"interface"`
	SourceIP        string   `json:"source_ip"`
	PingTargets     []string `json:"ping_targets"`
	PingCount       int      `json:"ping_count"`
	PingTimeout     int      `json:"ping_timeout"`
	CheckInterval   int      `json:"check_interval"`
	OnlineThreshold float64  `json:"online_threshold"`
	IPCheckURLs     []string `json:"ip_check_urls"`
	BackendURL      string   `json:"backend_url"`
	Token           string   `json:"token"`
	LogFile         string   `json:"log_file"`
}

type PingResult struct {
	Target    string  `json:"target"`
	Sent      int     `json:"sent"`
	Received  int     `json:"received"`
	LostPct   float64 `json:"lost_pct"`
	AvgRTTMS  float64 `json:"avg_rtt_ms"`
	MinRTTMS  float64 `json:"min_rtt_ms"`
	MaxRTTMS  float64 `json:"max_rtt_ms"`
	Reachable bool    `json:"reachable"`
	Error     string  `json:"error,omitempty"`
}

type Payload struct {
	AgentID     string       `json:"agent_id"`
	LinkName    string       `json:"link_name"`
	Interface   string       `json:"interface,omitempty"`
	SourceIP    string       `json:"source_ip,omitempty"`
	Timestamp   string       `json:"timestamp"`
	IsOnline    bool         `json:"is_online"`
	SuccessRate float64      `json:"success_rate"`
	PublicIP    string       `json:"public_ip,omitempty"`
	IPChanged   bool         `json:"ip_changed"`
	Version     string       `json:"version"`
	PingResults []PingResult `json:"ping_results"`
}

var (
	packetLineRe        = regexp.MustCompile(`(?i)(\d+)\D+(?:packets?|pacotes?)\D+(?:transmitted|transmitidos)`)
	rttLineRe           = regexp.MustCompile(`=\s*([0-9]+(?:[.,][0-9]+)?)/([0-9]+(?:[.,][0-9]+)?)/([0-9]+(?:[.,][0-9]+)?)`)
	msValueRe           = regexp.MustCompile(`([0-9]+(?:[.,][0-9]+)?)\s*ms`)
	publicIPv4Re        = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	privateBlocks       = []string{"10.", "127.", "169.254.", "192.168."}
	unreachablePatterns = []string{"unreachable", "inacess", "inacces", "timeout", "timed out", "esgotado", "100% packet loss"}
)

func main() {
	configPath := flag.String("config", "config.json", "path to LinkProbe JSON config")
	once := flag.Bool("once", false, "run one cycle and exit")
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}
	logger, closeLog, err := newLogger(cfg.LogFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "log error: %v\n", err)
		os.Exit(1)
	}
	defer closeLog()

	logger.Printf("LinkProbe %s started for %s (%s)", version, cfg.LinkName, cfg.AgentID)
	var lastPublicIP string
	for {
		payload := runCycle(cfg, lastPublicIP, logger)
		if payload.PublicIP != "" {
			lastPublicIP = payload.PublicIP
		}
		if err := sendPayload(cfg, payload); err != nil {
			logger.Printf("send failed: %v", err)
		}
		logger.Printf("cycle status online=%v success_rate=%.3f public_ip=%s changed=%v", payload.IsOnline, payload.SuccessRate, payload.PublicIP, payload.IPChanged)
		if *once {
			break
		}
		time.Sleep(time.Duration(cfg.CheckInterval) * time.Second)
	}
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	cfg.AgentID = strings.TrimSpace(cfg.AgentID)
	cfg.LinkName = strings.TrimSpace(cfg.LinkName)
	cfg.Interface = strings.TrimSpace(cfg.Interface)
	cfg.SourceIP = strings.TrimSpace(cfg.SourceIP)
	cfg.BackendURL = strings.TrimRight(strings.TrimSpace(cfg.BackendURL), "/")
	cfg.Token = strings.TrimSpace(cfg.Token)
	if cfg.AgentID == "" {
		return cfg, errors.New("agent_id is required")
	}
	if cfg.LinkName == "" {
		cfg.LinkName = cfg.AgentID
	}
	if cfg.SourceIP != "" && net.ParseIP(cfg.SourceIP) == nil {
		return cfg, fmt.Errorf("invalid source_ip: %s", cfg.SourceIP)
	}
	if len(cfg.PingTargets) == 0 || len(cfg.PingTargets) > 10 {
		return cfg, errors.New("ping_targets must contain 1 to 10 hosts")
	}
	for _, target := range cfg.PingTargets {
		if strings.TrimSpace(target) == "" {
			return cfg, errors.New("ping_targets cannot contain empty values")
		}
	}
	if cfg.PingCount <= 0 {
		cfg.PingCount = 4
	}
	if cfg.PingTimeout <= 0 {
		cfg.PingTimeout = 5
	}
	if cfg.CheckInterval <= 0 {
		cfg.CheckInterval = 60
	}
	if cfg.OnlineThreshold <= 0 || cfg.OnlineThreshold > 1 {
		cfg.OnlineThreshold = 0.5
	}
	if len(cfg.IPCheckURLs) == 0 {
		cfg.IPCheckURLs = []string{"https://api.ipify.org", "https://ifconfig.me/ip", "http://icanhazip.com"}
	}
	if cfg.BackendURL == "" {
		return cfg, errors.New("backend_url is required")
	}
	return cfg, nil
}

func newLogger(logFile string) (*log.Logger, func(), error) {
	if strings.TrimSpace(logFile) == "" {
		return log.New(os.Stdout, "", log.LstdFlags), func() {}, nil
	}
	file, err := os.OpenFile(logFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, nil, err
	}
	return log.New(file, "", log.LstdFlags), func() { _ = file.Close() }, nil
}

func runCycle(cfg Config, lastPublicIP string, logger *log.Logger) Payload {
	results := make([]PingResult, 0, len(cfg.PingTargets))
	reachable := 0
	for _, target := range cfg.PingTargets {
		result := pingTarget(cfg, strings.TrimSpace(target))
		if result.Reachable {
			reachable++
		}
		if result.Error != "" {
			logger.Printf("ping %s failed: %s", target, result.Error)
		}
		results = append(results, result)
	}
	successRate := 0.0
	if len(results) > 0 {
		successRate = float64(reachable) / float64(len(results))
	}
	publicIP, err := detectPublicIP(cfg)
	if err != nil {
		logger.Printf("public ip check failed: %v", err)
	}
	return Payload{
		AgentID:     cfg.AgentID,
		LinkName:    cfg.LinkName,
		Interface:   cfg.Interface,
		SourceIP:    cfg.SourceIP,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		IsOnline:    successRate >= cfg.OnlineThreshold,
		SuccessRate: round(successRate, 3),
		PublicIP:    publicIP,
		IPChanged:   lastPublicIP != "" && publicIP != "" && publicIP != lastPublicIP,
		Version:     version,
		PingResults: results,
	}
}

func pingTarget(cfg Config, target string) PingResult {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.PingCount*cfg.PingTimeout+3)*time.Second)
	defer cancel()
	args := pingArgs(cfg, target)
	cmd := exec.CommandContext(ctx, "ping", args...)
	output, err := cmd.CombinedOutput()
	result := parsePingOutput(target, cfg.PingCount, string(output))
	if ctx.Err() == context.DeadlineExceeded {
		result.Error = "ping timeout"
		return result
	}
	if err != nil && result.Received == 0 {
		result.Error = cleanError(err, output)
	}
	return result
}

func pingArgs(cfg Config, target string) []string {
	if runtime.GOOS == "windows" {
		args := []string{}
		if cfg.SourceIP != "" {
			args = append(args, "-S", cfg.SourceIP)
		}
		return append(args, "-n", strconv.Itoa(cfg.PingCount), "-w", strconv.Itoa(cfg.PingTimeout*1000), target)
	}
	bind := cfg.Interface
	if bind == "" {
		bind = cfg.SourceIP
	}
	args := []string{}
	if bind != "" {
		args = append(args, "-I", bind)
	}
	return append(args, "-c", strconv.Itoa(cfg.PingCount), "-W", strconv.Itoa(cfg.PingTimeout), target)
}

func parsePingOutput(target string, sent int, output string) PingResult {
	received := countEchoReplies(output, target)
	if match := packetLineRe.FindStringSubmatch(output); len(match) == 2 {
		if parsedSent, err := strconv.Atoi(match[1]); err == nil && parsedSent > 0 {
			sent = parsedSent
		}
	}
	minRTT, avgRTT, maxRTT := parseRTT(output)
	lostPct := 100.0
	if sent > 0 {
		lostPct = round((float64(sent-received)/float64(sent))*100, 2)
	}
	return PingResult{
		Target:    target,
		Sent:      sent,
		Received:  received,
		LostPct:   lostPct,
		AvgRTTMS:  avgRTT,
		MinRTTMS:  minRTT,
		MaxRTTMS:  maxRTT,
		Reachable: received > 0,
	}
}

func countEchoReplies(output string, target string) int {
	count := 0
	target = strings.ToLower(strings.TrimSpace(target))
	for _, line := range strings.Split(output, "\n") {
		lower := strings.ToLower(line)
		if isEchoReplyLine(lower, target) {
			count++
		}
	}
	return count
}

func isEchoReplyLine(line string, target string) bool {
	if target == "" || !strings.Contains(line, "ttl") {
		return false
	}
	for _, pattern := range unreachablePatterns {
		if strings.Contains(line, pattern) {
			return false
		}
	}
	return strings.Contains(line, "bytes from "+target) ||
		strings.Contains(line, "reply from "+target) ||
		strings.Contains(line, "resposta de "+target)
}

func parseRTT(output string) (float64, float64, float64) {
	if match := rttLineRe.FindStringSubmatch(output); len(match) >= 4 {
		return parseNumber(match[1]), parseNumber(match[2]), parseNumber(match[3])
	}
	for _, line := range strings.Split(output, "\n") {
		values := msValueRe.FindAllStringSubmatch(line, -1)
		if len(values) >= 3 {
			return parseNumber(values[0][1]), parseNumber(values[2][1]), parseNumber(values[1][1])
		}
	}
	return 0, 0, 0
}

func detectPublicIP(cfg Config) (string, error) {
	var lastErr error
	client := &http.Client{Timeout: time.Duration(cfg.PingTimeout+3) * time.Second}
	if cfg.SourceIP != "" {
		sourceIP := net.ParseIP(cfg.SourceIP)
		client.Transport = &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   time.Duration(cfg.PingTimeout) * time.Second,
				LocalAddr: &net.TCPAddr{IP: sourceIP},
			}).DialContext,
		}
	}
	for _, rawURL := range cfg.IPCheckURLs {
		url := strings.TrimSpace(rawURL)
		if url == "" {
			continue
		}
		req, _ := http.NewRequest(http.MethodGet, url, nil)
		req.Header.Set("User-Agent", "ServerWatch-LinkProbe/"+version)
		res, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(res.Body, 512))
		_ = res.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if res.StatusCode < 200 || res.StatusCode > 299 {
			lastErr = fmt.Errorf("%s returned HTTP %d", url, res.StatusCode)
			continue
		}
		ip := publicIPv4Re.FindString(string(body))
		if ip != "" && net.ParseIP(ip) != nil {
			return ip, nil
		}
		lastErr = fmt.Errorf("%s did not return an IPv4 address", url)
	}
	if lastErr == nil {
		lastErr = errors.New("no ip_check_urls configured")
	}
	return "", lastErr
}

func sendPayload(cfg Config, payload Payload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := strings.TrimRight(cfg.BackendURL, "/") + "/api/link-status"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ServerWatch-LinkProbe/"+version)
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
		req.Header.Set("X-ServerWatch-Probe-Token", cfg.Token)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("backend returned HTTP %d", res.StatusCode)
	}
	return nil
}

func parseNumber(value string) float64 {
	number, _ := strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64)
	return round(number, 2)
}

func round(value float64, places int) float64 {
	pow := math.Pow10(places)
	return math.Round(value*pow) / pow
}

func cleanError(err error, output []byte) string {
	text := strings.TrimSpace(string(output))
	if text == "" {
		return err.Error()
	}
	lines := strings.Split(text, "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

func isPrivateIPv4(ip string) bool {
	for _, prefix := range privateBlocks {
		if strings.HasPrefix(ip, prefix) {
			return true
		}
	}
	if strings.HasPrefix(ip, "172.") {
		parts := strings.Split(ip, ".")
		if len(parts) > 1 {
			second, _ := strconv.Atoi(parts[1])
			return second >= 16 && second <= 31
		}
	}
	return false
}
