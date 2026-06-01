using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ServerWatchProbeSetup;

internal static class Program
{
    private const string TaskName = "ServerWatch Probe Collector";
    private const string ProbeCollectorVersion = "0.2.0";
    private const string NodeRuntimeDownloadPath = "/downloads/probe/node-runtime-windows-x64";
    private static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "ServerWatchProbe"
    );
    private static readonly string ConfigPath = Path.Combine(InstallDir, "config.json");
    private static readonly string NodeRuntimeDir = Path.Combine(InstallDir, "node");
    private static readonly string NodePath = Path.Combine(NodeRuntimeDir, "node.exe");
    private static readonly string LegacyNodePath = Path.Combine(InstallDir, "node.exe");

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
                    "ServerWatch Probe Collector",
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
        private readonly TextBox probeId = new();
        private readonly TextBox probeName = new();
        private readonly TextBox token = new();
        private readonly NumericUpDown intervalSeconds = new();
        private readonly NumericUpDown timeoutMs = new();
        private readonly Label status = new();
        private readonly ProgressBar progress = new();
        private readonly TextBox logBox = new();
        private readonly Button installButton = new();
        private readonly Button repairButton = new();
        private readonly Button removeButton = new();
        private readonly Panel card = new();

        public InstallerForm()
        {
            Text = "ServerWatch Probe Collector";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(640, 590);
            Font = new Font("Segoe UI", 9);
            BackColor = Color("#eef2f3");
            Icon = CreateServerWatchIcon();

            var header = new Panel
            {
                Location = new Point(0, 0),
                Size = new Size(640, 112),
                BackColor = Color("#0b2545")
            };
            Controls.Add(header);

            var brandMark = new Label
            {
                Text = "SW",
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = System.Drawing.Color.White,
                BackColor = Color("#dc2626"),
                Location = new Point(26, 24),
                Size = new Size(42, 42)
            };
            header.Controls.Add(brandMark);

            var brand = new Label
            {
                Text = "ServerWatch",
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = System.Drawing.Color.White,
                BackColor = Color("#0b2545"),
                Location = new Point(80, 22),
                Size = new Size(200, 22)
            };
            header.Controls.Add(brand);

            var caption = new Label
            {
                Text = "Probe Collector",
                ForeColor = Color("#9fb9b9"),
                BackColor = Color("#0b2545"),
                Location = new Point(80, 44),
                Size = new Size(200, 20)
            };
            header.Controls.Add(caption);

            var title = new Label
            {
                Text = "Instalar probe local",
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                ForeColor = System.Drawing.Color.White,
                BackColor = Color("#0b2545"),
                TextAlign = ContentAlignment.MiddleRight,
                Location = new Point(318, 24),
                Size = new Size(290, 28)
            };
            header.Controls.Add(title);

            var subtitle = new Label
            {
                Text = "Configure a conexao de saida com o ServerWatch central.",
                ForeColor = System.Drawing.Color.White,
                BackColor = Color("#0b2545"),
                TextAlign = ContentAlignment.MiddleRight,
                Location = new Point(248, 55),
                Size = new Size(360, 22)
            };
            header.Controls.Add(subtitle);

            card.Location = new Point(22, 132);
            card.Size = new Size(596, 392);
            card.BackColor = System.Drawing.Color.White;
            card.BorderStyle = BorderStyle.None;
            Controls.Add(card);

            AddLabel("URL do ServerWatch", 22, 22);
            ConfigureTextBox(serverUrl, 22, 44, 552);

            AddLabel("ID do probe", 22, 84);
            ConfigureTextBox(probeId, 22, 106, 238);

            AddLabel("Nome", 314, 84);
            ConfigureTextBox(probeName, 314, 106, 260);

            AddLabel("Token", 22, 146);
            ConfigureTextBox(token, 22, 168, 552);
            token.UseSystemPasswordChar = true;

            AddLabel("Intervalo em segundos", 22, 208, 140);
            ConfigureNumber(intervalSeconds, 22, 230, 120, 3, 3600, 10);

            AddLabel("Timeout em ms", 172, 208, 140);
            ConfigureNumber(timeoutMs, 172, 230, 120, 500, 60000, 2500);

            progress.Location = new Point(22, 272);
            progress.Size = new Size(552, 18);
            progress.Minimum = 0;
            progress.Maximum = 100;
            card.Controls.Add(progress);

            status.Location = new Point(22, 300);
            status.Size = new Size(552, 18);
            status.Text = $"O probe sera instalado em {InstallDir}.";
            status.ForeColor = Color("#657477");
            card.Controls.Add(status);

            logBox.Location = new Point(22, 326);
            logBox.Size = new Size(552, 52);
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            card.Controls.Add(logBox);

            installButton.Text = "Instalar e iniciar";
            installButton.Location = new Point(458, 540);
            installButton.Size = new Size(160, 34);
            StylePrimaryButton(installButton);
            installButton.Click += (_, _) => Install();
            Controls.Add(installButton);

            repairButton.Text = "Reparar";
            repairButton.Location = new Point(344, 540);
            repairButton.Size = new Size(100, 34);
            StyleSecondaryButton(repairButton);
            repairButton.Click += (_, _) => Install();
            Controls.Add(repairButton);

            removeButton.Text = "Remover";
            removeButton.Location = new Point(232, 540);
            removeButton.Size = new Size(100, 34);
            StyleSecondaryButton(removeButton);
            removeButton.Click += (_, _) => RemoveProbe();
            Controls.Add(removeButton);

            var cancelButton = new Button
            {
                Text = "Cancelar",
                Location = new Point(120, 540),
                Size = new Size(100, 34)
            };
            StyleSecondaryButton(cancelButton);
            cancelButton.Click += (_, _) => Close();
            Controls.Add(cancelButton);

            LoadExistingConfig();
        }

        private void AddLabel(string text, int x, int y, int width = 210)
        {
            card.Controls.Add(new Label
            {
                Text = text,
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                BackColor = System.Drawing.Color.White,
                Location = new Point(x, y),
                Size = new Size(width, 20)
            });
        }

        private void ConfigureTextBox(TextBox box, int x, int y, int width)
        {
            box.Location = new Point(x, y);
            box.Size = new Size(width, 24);
            card.Controls.Add(box);
        }

        private void ConfigureNumber(NumericUpDown box, int x, int y, int width, int minimum, int maximum, int value)
        {
            box.Location = new Point(x, y);
            box.Size = new Size(width, 24);
            box.Minimum = minimum;
            box.Maximum = maximum;
            box.Value = value;
            card.Controls.Add(box);
        }

        private static System.Drawing.Color Color(string hex)
        {
            return ColorTranslator.FromHtml(hex);
        }

        private static void StylePrimaryButton(Button button)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = Color("#123c69");
            button.ForeColor = System.Drawing.Color.White;
            button.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        }

        private static void StyleSecondaryButton(Button button)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Color("#dbe3e4");
            button.BackColor = System.Drawing.Color.White;
            button.ForeColor = Color("#142022");
        }

        private static Icon CreateServerWatchIcon()
        {
            using var bitmap = new Bitmap(32, 32);
            using var graphics = Graphics.FromImage(bitmap);
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            graphics.Clear(System.Drawing.Color.Transparent);

            using var background = new SolidBrush(Color("#dc2626"));
            using var foreground = new SolidBrush(System.Drawing.Color.White);
            using var font = new Font("Segoe UI", 10, FontStyle.Bold);

            graphics.FillRectangle(background, 0, 0, 32, 32);
            var size = graphics.MeasureString("SW", font);
            var x = Math.Max(0, (32 - size.Width) / 2);
            var y = Math.Max(0, (32 - size.Height) / 2 - 1);
            graphics.DrawString("SW", font, foreground, x, y);
            using var icon = Icon.FromHandle(bitmap.GetHicon());
            return (Icon)icon.Clone();
        }

        private void LoadExistingConfig()
        {
            if (!File.Exists(ConfigPath))
            {
                probeId.Text = Environment.MachineName;
                probeName.Text = Environment.MachineName;
                return;
            }

            try
            {
                var json = JsonNode.Parse(File.ReadAllText(ConfigPath))?.AsObject();
                if (json is null)
                {
                    return;
                }

                serverUrl.Text = json["serverUrl"]?.GetValue<string>() ?? "";
                probeId.Text = json["probeId"]?.GetValue<string>() ?? "";
                probeName.Text = json["name"]?.GetValue<string>() ?? "";
                token.Text = json["token"]?.GetValue<string>() ?? "";
                intervalSeconds.Value = Math.Clamp(json["intervalSeconds"]?.GetValue<int>() ?? 10, 3, 3600);
                timeoutMs.Value = Math.Clamp(json["timeoutMs"]?.GetValue<int>() ?? 2500, 500, 60000);
            }
            catch
            {
                // Ignore invalid previous configuration and let the user overwrite it.
            }
        }

        private void Install()
        {
            SetButtons(false);
            SetProgress(0, "Instalando...");

            try
            {
                var values = ReadValues();
                Validate(values);
                ValidateServerWatch(values);
                var backupDir = CreateBackup();
                try
                {
                    StopExistingProbe();
                    Directory.CreateDirectory(InstallDir);

                    SetProgress(20, "Copiando arquivos do collector...");
                    WriteResource("collector.js", Path.Combine(InstallDir, "collector.js"));
                    WriteResource("setup-server.js", Path.Combine(InstallDir, "setup-server.js"));
                    RemoveLegacyNodeRuntime();
                    SetProgress(35, "Preparando runtime Node.js...");
                    EnsureNodeRuntime(values);
                    SetProgress(55, "Salvando configuracao...");
                    WriteConfig(values);
                    SetProgress(70, "Configurando tarefa agendada...");
                    RegisterTask();
                    SetProgress(82, "Iniciando Probe Collector...");
                    RunTask();
                    RegisterProbe(values);
                    RemoveBackup(backupDir);
                }
                catch
                {
                    RestoreBackup(backupDir);
                    throw;
                }

                SetProgress(100, "Instalacao concluida. O probe ja foi registrado no ServerWatch.");
                MessageBox.Show(
                    "ServerWatch Probe Collector instalado, iniciado e registrado com sucesso.",
                    "ServerWatch Probe Collector",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                Close();
            }
            catch (Exception error)
            {
                SetProgress(0, error.Message);
                MessageBox.Show(error.Message, "Erro na instalacao", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetButtons(true);
            }
        }

        private void SetButtons(bool enabled)
        {
            installButton.Enabled = enabled;
            repairButton.Enabled = enabled;
            removeButton.Enabled = enabled;
        }

        private void SetProgress(int value, string message)
        {
            progress.Value = Math.Max(progress.Minimum, Math.Min(progress.Maximum, value));
            status.Text = message;
            logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
            Application.DoEvents();
        }

        private ProbeConfig ReadValues()
        {
            return new ProbeConfig(
                serverUrl.Text.Trim().TrimEnd('/'),
                probeId.Text.Trim(),
                string.IsNullOrWhiteSpace(probeName.Text) ? probeId.Text.Trim() : probeName.Text.Trim(),
                token.Text.Trim(),
                decimal.ToInt32(intervalSeconds.Value),
                decimal.ToInt32(timeoutMs.Value)
            );
        }

        private static void Validate(ProbeConfig config)
        {
            if (!Uri.TryCreate(config.ServerUrl, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                throw new InvalidOperationException("A URL do ServerWatch deve iniciar com http:// ou https://.");
            }

            if (string.IsNullOrWhiteSpace(config.ProbeId))
            {
                throw new InvalidOperationException("Informe o ID do probe.");
            }

            if (string.IsNullOrWhiteSpace(config.Token))
            {
                throw new InvalidOperationException("Informe o token.");
            }
        }

        private void ValidateServerWatch(ProbeConfig config)
        {
            SetProgress(8, "Validando URL e token no ServerWatch...");
            var url = $"{config.ServerUrl.TrimEnd('/')}/api/probe/validate?probeId={Uri.EscapeDataString(config.ProbeId)}";
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {config.Token}");
            request.Headers.TryAddWithoutValidation("X-ServerWatch-Probe-Token", config.Token);
            using var response = client.Send(request);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"URL ou token invalido. O ServerWatch retornou HTTP {(int)response.StatusCode}.");
            }
        }

        private void RegisterProbe(ProbeConfig config)
        {
            SetProgress(90, "Registrando probe no ServerWatch...");
            var url =
                $"{config.ServerUrl.TrimEnd('/')}/api/probe/targets" +
                $"?probeId={Uri.EscapeDataString(config.ProbeId)}" +
                $"&name={Uri.EscapeDataString(config.Name)}" +
                $"&version={Uri.EscapeDataString(ProbeCollectorVersion)}" +
                $"&hostName={Uri.EscapeDataString(Environment.MachineName)}" +
                "&platform=windows";
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {config.Token}");
            request.Headers.TryAddWithoutValidation("X-ServerWatch-Probe-Token", config.Token);
            using var response = client.Send(request);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"O probe foi instalado, mas nao conseguiu se registrar. HTTP {(int)response.StatusCode}.");
            }
        }

        private static void WriteResource(string name, string destination)
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var input = assembly.GetManifestResourceStream(name)
                ?? throw new InvalidOperationException($"Recurso nao encontrado: {name}");
            using var output = File.Create(destination);
            input.CopyTo(output);
        }

        private static void WriteConfig(ProbeConfig config)
        {
            var payload = new
            {
                serverUrl = config.ServerUrl,
                probeId = config.ProbeId,
                name = config.Name,
                token = config.Token,
                intervalSeconds = config.IntervalSeconds,
                timeoutMs = config.TimeoutMs
            };
            var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(ConfigPath, json + Environment.NewLine);
        }

        private static void RegisterTask()
        {
            var collectorPath = Path.Combine(InstallDir, "collector.js");
            var taskCommand = $"\"{NodePath}\" \"{collectorPath}\" --config \"{ConfigPath}\"";
            RunProcess(
                "schtasks.exe",
                $"/Create /TN \"{TaskName}\" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR \"{taskCommand}\" /F"
            );
        }

        private static void RunTask()
        {
            RunProcess("schtasks.exe", $"/Run /TN \"{TaskName}\"");
        }

        private void StopExistingProbe()
        {
            SetProgress(12, "Parando instalacao anterior, se existir...");
            RunProcess("schtasks.exe", $"/End /TN \"{TaskName}\"", allowFailure: true);
            var managedNodePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                NodePath,
                LegacyNodePath
            };
            foreach (var process in Process.GetProcessesByName("node"))
            {
                try
                {
                    if (process.MainModule?.FileName is string processPath && managedNodePaths.Contains(processPath))
                    {
                        process.Kill(true);
                    }
                }
                catch
                {
                    // Best effort cleanup before updating the managed runtime.
                }
            }
        }

        private void EnsureNodeRuntime(ProbeConfig config)
        {
            if (File.Exists(NodePath))
            {
                ValidateNodeRuntime();
                SetProgress(48, "Runtime Node.js existente validado.");
                return;
            }

            var tempRoot = Path.Combine(Path.GetTempPath(), $"ServerWatchProbeNode.{Guid.NewGuid():N}");
            var zipPath = Path.Combine(tempRoot, "node-runtime.zip");
            var extractDir = Path.Combine(tempRoot, "extract");
            try
            {
                Directory.CreateDirectory(tempRoot);
                SetProgress(38, "Baixando runtime Node.js do ServerWatch...");
                DownloadRuntime(config, zipPath);

                SetProgress(45, "Extraindo runtime Node.js...");
                ZipFile.ExtractToDirectory(zipPath, extractDir);
                var extractedNode = Directory.GetFiles(extractDir, "node.exe", SearchOption.AllDirectories).FirstOrDefault();
                if (string.IsNullOrWhiteSpace(extractedNode))
                {
                    throw new InvalidOperationException("O pacote do runtime Node.js nao contem node.exe.");
                }

                var extractedNodeDir = Path.GetDirectoryName(extractedNode)
                    ?? throw new InvalidOperationException("Nao foi possivel localizar a pasta do runtime Node.js.");
                if (Directory.Exists(NodeRuntimeDir))
                {
                    Directory.Delete(NodeRuntimeDir, true);
                }
                CopyDirectory(extractedNodeDir, NodeRuntimeDir);
                ValidateNodeRuntime();
            }
            catch (Exception error)
            {
                throw new InvalidOperationException(
                    $"Nao foi possivel preparar o runtime Node.js. Confirme se o ServerWatch possui o runtime Windows publicado. Detalhe: {error.Message}"
                );
            }
            finally
            {
                try
                {
                    if (Directory.Exists(tempRoot))
                    {
                        Directory.Delete(tempRoot, true);
                    }
                }
                catch
                {
                    // Temporary files can be cleaned by Windows later if antivirus/indexing holds a handle.
                }
            }
        }

        private static void DownloadRuntime(ProbeConfig config, string destination)
        {
            var url = CombineUrl(config.ServerUrl, NodeRuntimeDownloadPath);
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {config.Token}");
            request.Headers.TryAddWithoutValidation("X-ServerWatch-Probe-Token", config.Token);
            using var response = client.Send(request, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Download retornou HTTP {(int)response.StatusCode}.");
            }

            using var input = response.Content.ReadAsStream();
            using var output = File.Create(destination);
            input.CopyTo(output);
        }

        private static string CombineUrl(string serverUrl, string path)
        {
            return $"{serverUrl.TrimEnd('/')}/{path.TrimStart('/')}";
        }

        private static void ValidateNodeRuntime()
        {
            if (!File.Exists(NodePath))
            {
                throw new InvalidOperationException("node.exe nao foi encontrado no runtime baixado.");
            }

            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = NodePath,
                Arguments = "--version",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true
            }) ?? throw new InvalidOperationException("Nao foi possivel validar node.exe.");

            var output = process.StandardOutput.ReadToEnd().Trim();
            var error = process.StandardError.ReadToEnd().Trim();
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? "node.exe retornou erro." : error);
            }

            var version = output.TrimStart('v');
            var majorText = version.Split('.', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (!int.TryParse(majorText, out var major) || major < 20)
            {
                throw new InvalidOperationException($"Runtime Node.js incompativel: {output}. Use Node.js 20 ou superior.");
            }
        }

        private static void RemoveLegacyNodeRuntime()
        {
            try
            {
                if (File.Exists(LegacyNodePath))
                {
                    File.Delete(LegacyNodePath);
                }
            }
            catch
            {
                // Best effort cleanup; the new scheduled task uses the runtime under the node folder.
            }
        }

        private string? CreateBackup()
        {
            if (!Directory.Exists(InstallDir))
            {
                return null;
            }

            SetProgress(14, "Criando backup da instalacao atual...");
            var backupDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                $"ServerWatchProbe.backup.{DateTime.Now:yyyyMMddHHmmss}"
            );
            CopyDirectory(InstallDir, backupDir);
            return backupDir;
        }

        private void RestoreBackup(string? backupDir)
        {
            if (string.IsNullOrWhiteSpace(backupDir) || !Directory.Exists(backupDir))
            {
                return;
            }

            try
            {
                SetProgress(5, "Restaurando instalacao anterior...");
                RunProcess("schtasks.exe", $"/End /TN \"{TaskName}\"", allowFailure: true);
                RunProcess("schtasks.exe", $"/Delete /TN \"{TaskName}\" /F", allowFailure: true);
                if (Directory.Exists(InstallDir))
                {
                    Directory.Delete(InstallDir, true);
                }
                CopyDirectory(backupDir, InstallDir);
                RegisterTask();
                RunTask();
            }
            catch (Exception error)
            {
                logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] Nao foi possivel restaurar automaticamente: {error.Message}{Environment.NewLine}");
            }
        }

        private static void RemoveBackup(string? backupDir)
        {
            if (!string.IsNullOrWhiteSpace(backupDir) && Directory.Exists(backupDir))
            {
                Directory.Delete(backupDir, true);
            }
        }

        private static void CopyDirectory(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
            {
                Directory.CreateDirectory(directory.Replace(source, destination));
            }
            foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                File.Copy(file, file.Replace(source, destination), overwrite: true);
            }
        }

        private void RemoveProbe()
        {
            if (MessageBox.Show(
                    "Remover o ServerWatch Probe Collector deste Windows?",
                    "ServerWatch Probe Collector",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                ) != DialogResult.Yes)
            {
                return;
            }

            SetButtons(false);
            try
            {
                SetProgress(10, "Parando tarefa agendada...");
                RunProcess("schtasks.exe", $"/End /TN \"{TaskName}\"", allowFailure: true);
                SetProgress(40, "Removendo tarefa agendada...");
                RunProcess("schtasks.exe", $"/Delete /TN \"{TaskName}\" /F", allowFailure: true);
                SetProgress(70, "Removendo arquivos locais...");
                if (Directory.Exists(InstallDir))
                {
                    Directory.Delete(InstallDir, true);
                }
                SetProgress(100, "Probe Collector removido.");
                MessageBox.Show("Probe Collector removido.", "ServerWatch Probe Collector", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch (Exception error)
            {
                SetProgress(0, error.Message);
                MessageBox.Show(error.Message, "Erro na remocao", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetButtons(true);
            }
        }

        private static void RunProcess(string fileName, string arguments, bool allowFailure = false)
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true
            }) ?? throw new InvalidOperationException($"Nao foi possivel iniciar {fileName}.");

            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit();

            if (process.ExitCode != 0 && !allowFailure)
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? output : error);
            }
        }
    }

    private sealed record ProbeConfig(
        string ServerUrl,
        string ProbeId,
        string Name,
        string Token,
        int IntervalSeconds,
        int TimeoutMs
    );
}
