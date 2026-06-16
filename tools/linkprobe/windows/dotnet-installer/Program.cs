using System.Diagnostics;
using System.Reflection;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ServerWatchLinkProbeSetup;

internal static class Program
{
    private static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "ServerWatchLinkProbe"
    );
    private static readonly string BinDir = Path.Combine(InstallDir, "bin");
    private static readonly string AgentsDir = Path.Combine(InstallDir, "agents");
    private static readonly string LinkProbePath = Path.Combine(BinDir, "linkprobe.exe");

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        if (!IsAdministrator())
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = Environment.ProcessPath,
                    UseShellExecute = true,
                    Verb = "runas"
                });
            }
            catch
            {
                MessageBox.Show(
                    "Nao foi possivel solicitar permissao de Administrador. Execute o instalador novamente e aceite o UAC.",
                    "ServerWatch LinkProbe",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
            return;
        }

        Application.Run(new InstallerForm());
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private sealed class InstallerForm : Form
    {
        private readonly TextBox serverUrl = new();
        private readonly TextBox token = new();
        private readonly TextBox agentPrefix = new();
        private readonly NumericUpDown intervalSeconds = new();
        private readonly NumericUpDown timeoutSeconds = new();
        private readonly DataGridView linksGrid = new();
        private readonly Label status = new();
        private readonly ProgressBar progress = new();
        private readonly TextBox logBox = new();
        private readonly Button installButton = new();
        private readonly Button removeButton = new();
        private readonly Panel card = new();

        public InstallerForm()
        {
            Text = "ServerWatch LinkProbe";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(760, 650);
            Font = new Font("Segoe UI", 9);
            BackColor = Html("#eef2f3");
            Icon = CreateServerWatchIcon();

            var header = new Panel
            {
                Location = new Point(0, 0),
                Size = new Size(760, 112),
                BackColor = Html("#0b2545")
            };
            Controls.Add(header);

            var brandMark = new PictureBox
            {
                Image = LoadBrandWordmark(),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Html("#0b2545"),
                Location = new Point(18, 16),
                Size = new Size(230, 68)
            };
            header.Controls.Add(brandMark);

            var title = new Label
            {
                Text = "Instalar monitoramento de links",
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Html("#0b2545"),
                TextAlign = ContentAlignment.MiddleRight,
                Location = new Point(330, 24),
                Size = new Size(398, 28)
            };
            header.Controls.Add(title);

            var subtitle = new Label
            {
                Text = "Configure 2 ou mais links com IP de teste e gateway.",
                ForeColor = Color.White,
                BackColor = Html("#0b2545"),
                TextAlign = ContentAlignment.MiddleRight,
                Location = new Point(318, 55),
                Size = new Size(410, 22)
            };
            header.Controls.Add(subtitle);

            card.Location = new Point(22, 132);
            card.Size = new Size(716, 452);
            card.BackColor = Color.White;
            card.BorderStyle = BorderStyle.None;
            Controls.Add(card);

            AddLabel("URL do ServerWatch", 22, 20);
            ConfigureTextBox(serverUrl, 22, 42, 328);

            AddLabel("Token", 374, 20);
            ConfigureTextBox(token, 374, 42, 320);
            token.UseSystemPasswordChar = true;

            AddLabel("Prefixo dos agentes", 22, 82);
            ConfigureTextBox(agentPrefix, 22, 104, 230);

            AddLabel("Intervalo em segundos", 276, 82, 150);
            ConfigureNumber(intervalSeconds, 276, 104, 130, 10, 3600, 10);

            AddLabel("Timeout em segundos", 430, 82, 150);
            ConfigureNumber(timeoutSeconds, 430, 104, 130, 1, 60, 5);

            var addRowButton = new Button
            {
                Text = "+ Link",
                Location = new Point(584, 102),
                Size = new Size(110, 28)
            };
            StyleSecondaryButton(addRowButton);
            addRowButton.Click += (_, _) => AddDefaultRow();
            card.Controls.Add(addRowButton);

            linksGrid.Location = new Point(22, 150);
            linksGrid.Size = new Size(672, 176);
            linksGrid.AllowUserToAddRows = false;
            linksGrid.AllowUserToDeleteRows = true;
            linksGrid.RowHeadersVisible = false;
            linksGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            linksGrid.MultiSelect = false;
            linksGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            linksGrid.BackgroundColor = Color.White;
            linksGrid.BorderStyle = BorderStyle.FixedSingle;
            linksGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Nome do link", Name = "name", FillWeight = 130 });
            linksGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "IP a pingar", Name = "target", FillWeight = 110 });
            linksGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Gateway", Name = "gateway", FillWeight = 110 });
            linksGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Mascara", Name = "prefix", FillWeight = 58 });
            card.Controls.Add(linksGrid);

            progress.Location = new Point(22, 344);
            progress.Size = new Size(672, 18);
            progress.Minimum = 0;
            progress.Maximum = 100;
            card.Controls.Add(progress);

            status.Location = new Point(22, 372);
            status.Size = new Size(672, 18);
            status.Text = $"O LinkProbe sera instalado em {InstallDir}.";
            status.ForeColor = Html("#657477");
            card.Controls.Add(status);

            logBox.Location = new Point(22, 398);
            logBox.Size = new Size(672, 42);
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            card.Controls.Add(logBox);

            removeButton.Text = "Remover";
            removeButton.Location = new Point(310, 602);
            removeButton.Size = new Size(128, 34);
            StyleSecondaryButton(removeButton);
            removeButton.Click += (_, _) => Remove();
            Controls.Add(removeButton);

            installButton.Text = "Instalar e iniciar";
            installButton.Location = new Point(578, 602);
            installButton.Size = new Size(160, 34);
            StylePrimaryButton(installButton);
            installButton.Click += (_, _) => Install();
            Controls.Add(installButton);

            LoadDefaults();
        }

        private void LoadDefaults()
        {
            serverUrl.Text = "http://192.168.0.187:3000";
            agentPrefix.Text = Slug(Environment.MachineName);
            intervalSeconds.Value = 10;
            timeoutSeconds.Value = 5;
            AddRow("Link 1 - Empresa", "4.2.2.2", "", "30");
            AddRow("Link 2 - Empresa", "149.112.112.112", "", "30");
        }

        private void AddDefaultRow()
        {
            var next = linksGrid.Rows.Count + 1;
            AddRow($"Link {next} - Empresa", "", "", "30");
        }

        private void AddRow(string name, string target, string gateway, string prefix)
        {
            if (linksGrid.Rows.Count >= 10)
            {
                ShowError("Limite de 10 links por instalacao.");
                return;
            }
            linksGrid.Rows.Add(name, target, gateway, prefix);
        }

        private async void Install()
        {
            var values = ReadValues();
            if (values is null) return;

            ToggleBusy(true);
            try
            {
                SetProgress(5, "Validando URL e token no ServerWatch...");
                await ValidateServer(values);

                SetProgress(18, "Criando diretorios...");
                Directory.CreateDirectory(BinDir);
                Directory.CreateDirectory(AgentsDir);

                SetProgress(28, "Copiando LinkProbe...");
                ExtractResource("linkprobe.exe", LinkProbePath);

                var completed = 0;
                foreach (var link in values.Links)
                {
                    completed++;
                    var percent = 28 + (int)Math.Round((completed / (double)values.Links.Count) * 54);
                    SetProgress(percent, $"Configurando {link.Name}...");
                    InstallLink(values, link);
                }

                SetProgress(100, $"{values.Links.Count} LinkProbes instalados e iniciados.");
                MessageBox.Show("Instalacao concluida.", "ServerWatch LinkProbe", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                SetProgress(0, ex.Message);
                ShowError(ex.Message);
            }
            finally
            {
                ToggleBusy(false);
            }
        }

        private void InstallLink(InstallValues values, LinkRow link)
        {
            var safeId = Slug($"{values.AgentPrefix}-{link.Name}");
            var configDir = Path.Combine(AgentsDir, safeId);
            Directory.CreateDirectory(configDir);

            if (!string.IsNullOrWhiteSpace(link.Gateway))
            {
                Run("route.exe", $"-p add {link.Target} mask 255.255.255.255 {link.Gateway} metric 1", ignoreErrors: true);
            }

            var configPath = Path.Combine(configDir, "config.json");
            var logPath = Path.Combine(configDir, "linkprobe.log");
            var config = new
            {
                agent_id = safeId,
                link_name = link.Name,
                @interface = "",
                source_ip = "",
                ping_targets = new[] { link.Target },
                targets = new[]
                {
                    new
                    {
                        name = link.Name,
                        host = link.Target,
                        gateway = link.Gateway,
                        prefix_length = link.PrefixLength
                    }
                },
                ping_count = 4,
                ping_timeout = values.TimeoutSeconds,
                check_interval = values.IntervalSeconds,
                online_threshold = 0.5,
                ip_check_urls = new[] { "https://api.ipify.org", "https://ifconfig.me/ip", "http://icanhazip.com" },
                backend_url = values.ServerUrl,
                token = values.Token,
                log_file = logPath
            };
            File.WriteAllText(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine);

            var taskName = TaskName(safeId);
            Run("schtasks.exe", $"/Delete /TN \"{taskName}\" /F", ignoreErrors: true);
            var taskCommand = $"\\\"{LinkProbePath}\\\" --config \\\"{configPath}\\\"";
            Run("schtasks.exe", $"/Create /TN \"{taskName}\" /TR \"{taskCommand}\" /SC ONSTART /RL HIGHEST /RU SYSTEM /F");
            Run("schtasks.exe", $"/Run /TN \"{taskName}\"", ignoreErrors: true);
            WriteLog($"{link.Name}: tarefa criada ({safeId}).");
        }

        private async Task ValidateServer(InstallValues values)
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {values.Token}");
            client.DefaultRequestHeaders.TryAddWithoutValidation("X-ServerWatch-Probe-Token", values.Token);
            var url = $"{values.ServerUrl.TrimEnd('/')}/api/probe/validate?probeId={Uri.EscapeDataString(values.AgentPrefix)}";
            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"ServerWatch retornou HTTP {(int)response.StatusCode}. Verifique URL e token.");
            }
        }

        private void Remove()
        {
            ToggleBusy(true);
            try
            {
                SetProgress(10, "Removendo tarefas agendadas...");
                foreach (var dir in Directory.Exists(AgentsDir) ? Directory.GetDirectories(AgentsDir) : Array.Empty<string>())
                {
                    var id = Path.GetFileName(dir);
                    Run("schtasks.exe", $"/End /TN \"{TaskName(id)}\"", ignoreErrors: true);
                    Run("schtasks.exe", $"/Delete /TN \"{TaskName(id)}\" /F", ignoreErrors: true);
                }

                SetProgress(65, "Removendo arquivos locais...");
                if (Directory.Exists(InstallDir))
                {
                    Directory.Delete(InstallDir, recursive: true);
                }
                SetProgress(100, "LinkProbe removido.");
            }
            catch (Exception ex)
            {
                SetProgress(0, ex.Message);
                ShowError(ex.Message);
            }
            finally
            {
                ToggleBusy(false);
            }
        }

        private InstallValues? ReadValues()
        {
            var values = new InstallValues
            {
                ServerUrl = serverUrl.Text.Trim().TrimEnd('/'),
                Token = token.Text.Trim(),
                AgentPrefix = Slug(agentPrefix.Text.Trim()),
                IntervalSeconds = (int)intervalSeconds.Value,
                TimeoutSeconds = (int)timeoutSeconds.Value
            };

            if (!Uri.TryCreate(values.ServerUrl, UriKind.Absolute, out var uri) || string.IsNullOrWhiteSpace(uri.Scheme))
            {
                ShowError("Informe uma URL valida do ServerWatch.");
                return null;
            }
            if (string.IsNullOrWhiteSpace(values.Token))
            {
                ShowError("Informe o token.");
                return null;
            }
            if (string.IsNullOrWhiteSpace(values.AgentPrefix))
            {
                ShowError("Informe o prefixo dos agentes.");
                return null;
            }

            foreach (DataGridViewRow row in linksGrid.Rows)
            {
                if (row.IsNewRow) continue;
                var link = new LinkRow
                {
                    Name = Cell(row, "name"),
                    Target = Cell(row, "target"),
                    Gateway = Cell(row, "gateway"),
                    PrefixLength = ParsePrefix(Cell(row, "prefix"))
                };
                if (string.IsNullOrWhiteSpace(link.Name) && string.IsNullOrWhiteSpace(link.Target) && string.IsNullOrWhiteSpace(link.Gateway))
                {
                    continue;
                }
                if (string.IsNullOrWhiteSpace(link.Name) || string.IsNullOrWhiteSpace(link.Target) || string.IsNullOrWhiteSpace(link.Gateway))
                {
                    ShowError("Cada link precisa de nome, IP a pingar e gateway.");
                    return null;
                }
                if (!IsIPv4(link.Target) || !IsIPv4(link.Gateway))
                {
                    ShowError($"IP ou gateway invalido em {link.Name}.");
                    return null;
                }
                values.Links.Add(link);
            }

            if (values.Links.Count < 2)
            {
                ShowError("Cadastre pelo menos 2 links.");
                return null;
            }
            if (values.Links.Count > 10)
            {
                ShowError("Cadastre no maximo 10 links.");
                return null;
            }
            if (values.Links.Select((link) => Slug($"{values.AgentPrefix}-{link.Name}")).Distinct(StringComparer.OrdinalIgnoreCase).Count() != values.Links.Count)
            {
                ShowError("Os nomes dos links precisam gerar IDs unicos.");
                return null;
            }

            return values;
        }

        private static string Cell(DataGridViewRow row, string name)
        {
            return Convert.ToString(row.Cells[name].Value)?.Trim() ?? "";
        }

        private static int ParsePrefix(string value)
        {
            var raw = value.Trim().TrimStart('/');
            if (string.IsNullOrWhiteSpace(raw)) return 30;
            return int.TryParse(raw, out var prefix) && prefix is >= 1 and <= 32 ? prefix : 30;
        }

        private static bool IsIPv4(string value)
        {
            return Regex.IsMatch(value, @"^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$");
        }

        private static string Slug(string value)
        {
            var lower = value.Trim().ToLowerInvariant();
            lower = Regex.Replace(lower, @"[^a-z0-9]+", "-");
            lower = Regex.Replace(lower, @"-+", "-").Trim('-');
            return string.IsNullOrWhiteSpace(lower) ? "linkprobe" : lower;
        }

        private static string TaskName(string id) => $"ServerWatch LinkProbe {id}";

        private void ToggleBusy(bool busy)
        {
            installButton.Enabled = !busy;
            removeButton.Enabled = !busy;
            linksGrid.Enabled = !busy;
        }

        private void SetProgress(int value, string message)
        {
            progress.Value = Math.Max(progress.Minimum, Math.Min(progress.Maximum, value));
            status.Text = message;
            WriteLog(message);
            Application.DoEvents();
        }

        private void WriteLog(string message)
        {
            logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
        }

        private static void Run(string fileName, string arguments, bool ignoreErrors = false)
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true
            });
            if (process is null)
            {
                if (!ignoreErrors) throw new InvalidOperationException($"Nao foi possivel iniciar {fileName}.");
                return;
            }
            process.WaitForExit();
            if (process.ExitCode != 0 && !ignoreErrors)
            {
                var error = process.StandardError.ReadToEnd();
                var output = process.StandardOutput.ReadToEnd();
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? output : error);
            }
        }

        private static void ExtractResource(string resourceName, string destination)
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"Recurso nao encontrado: {resourceName}");
            using var file = File.Create(destination);
            stream.CopyTo(file);
        }

        private void AddLabel(string text, int x, int y, int width = 180)
        {
            var label = new Label
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(width, 18),
                Font = new Font("Segoe UI", 8, FontStyle.Bold),
                ForeColor = Color.Black
            };
            card.Controls.Add(label);
        }

        private void ConfigureTextBox(TextBox box, int x, int y, int width)
        {
            box.Location = new Point(x, y);
            box.Size = new Size(width, 24);
            card.Controls.Add(box);
        }

        private void ConfigureNumber(NumericUpDown input, int x, int y, int width, int min, int max, int value)
        {
            input.Location = new Point(x, y);
            input.Size = new Size(width, 24);
            input.Minimum = min;
            input.Maximum = max;
            input.Value = value;
            card.Controls.Add(input);
        }

        private static void StylePrimaryButton(Button button)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = Html("#0b4a7a");
            button.ForeColor = Color.White;
        }

        private static void StyleSecondaryButton(Button button)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Html("#cbd5d8");
            button.BackColor = Color.White;
            button.ForeColor = Color.Black;
        }

        private static Color Html(string value) => ColorTranslator.FromHtml(value);

        private static Icon CreateServerWatchIcon()
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("serverwatch.ico");
            return stream is null ? SystemIcons.Application : new Icon(stream);
        }

        private static Image? LoadBrandWordmark()
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("serverwatch-wordmark.png");
            return stream is null ? null : Image.FromStream(stream);
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(message, "ServerWatch LinkProbe", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private sealed class InstallValues
    {
        public string ServerUrl { get; set; } = "";
        public string Token { get; set; } = "";
        public string AgentPrefix { get; set; } = "";
        public int IntervalSeconds { get; set; }
        public int TimeoutSeconds { get; set; }
        public List<LinkRow> Links { get; } = new();
    }

    private sealed class LinkRow
    {
        public string Name { get; set; } = "";
        public string Target { get; set; } = "";
        public string Gateway { get; set; } = "";
        public int PrefixLength { get; set; } = 30;
    }
}
