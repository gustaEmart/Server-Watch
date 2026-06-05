package main

import "testing"

func TestParsePingOutputIgnoresPortugueseUnreachableGateway(t *testing.T) {
	output := `Resposta de 192.168.0.200: Rede de destino inacessivel.
Resposta de 192.168.0.200: Rede de destino inacessivel.
Resposta de 192.168.0.200: Rede de destino inacessivel.
Resposta de 192.168.0.200: Rede de destino inacessivel.

Estatisticas do Ping para 4.2.2.2:
    Pacotes: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda),`

	result := parsePingOutput("4.2.2.2", 4, output)

	if result.Reachable {
		t.Fatalf("expected unreachable gateway messages to be offline, got reachable with %d received", result.Received)
	}
	if result.Received != 0 {
		t.Fatalf("expected 0 echo replies, got %d", result.Received)
	}
	if result.LostPct != 100 {
		t.Fatalf("expected 100%% packet loss, got %.2f", result.LostPct)
	}
}

func TestParsePingOutputCountsOnlyTargetEchoReplies(t *testing.T) {
	output := `64 bytes from 4.2.2.2: icmp_seq=1 ttl=55 time=12.3 ms
64 bytes from 4.2.2.2: icmp_seq=2 ttl=55 time=13.0 ms

--- 4.2.2.2 ping statistics ---
4 packets transmitted, 2 received, 50% packet loss, time 3000ms`

	result := parsePingOutput("4.2.2.2", 4, output)

	if !result.Reachable {
		t.Fatal("expected real target replies to be reachable")
	}
	if result.Received != 2 {
		t.Fatalf("expected 2 echo replies, got %d", result.Received)
	}
	if result.LostPct != 50 {
		t.Fatalf("expected 50%% packet loss, got %.2f", result.LostPct)
	}
}

