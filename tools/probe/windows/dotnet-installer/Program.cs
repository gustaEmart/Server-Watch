using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace ServerWatchProbeSetup;

internal static class Program
{
    private const string TaskName = "ServerWatch Probe Collector";
    private const string NodeRuntimeDownloadPath = "/downloads/probe/node-runtime-windows-x64";
    private static readonly Lazy<string> EmbeddedProbeCollectorVersion = new(ReadEmbeddedProbeCollectorVersion);
    private static string ProbeCollectorVersion => EmbeddedProbeCollectorVersion.Value;
    private static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "ServerWatchProbe"
    );
    private static readonly string ConfigPath = Path.Combine(InstallDir, "config.json");
    private static readonly string NodeRuntimeDir = Path.Combine(InstallDir, "node");
    private static readonly string NodePath = Path.Combine(NodeRuntimeDir, "node.exe");
    private static readonly string LegacyNodePath = Path.Combine(InstallDir, "node.exe");

    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--silent-repair", StringComparer.OrdinalIgnoreCase))
        {
            Environment.Exit(RunSilentRepair());
            return;
        }

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

    private static int RunSilentRepair()
    {
        try
        {
            if (!File.Exists(ConfigPath))
            {
                Console.Error.WriteLine($"config.json nao encontrado em {ConfigPath}; reparo silencioso requer uma instalacao existente.");
                return 1;
            }

            var json = File.ReadAllText(ConfigPath);
            var node = JsonNode.Parse(json) ?? throw new InvalidOperationException("config.json invalido.");
            var probeId = node["probeId"]?.GetValue<string>() ?? "";
            var config = new ProbeConfig(
                node["serverUrl"]?.GetValue<string>() ?? "",
                probeId,
                node["name"]?.GetValue<string>() ?? probeId,
                node["token"]?.GetValue<string>() ?? "",
                node["intervalSeconds"]?.GetValue<int?>() ?? 10,
                node["timeoutMs"]?.GetValue<int?>() ?? 2500
            );

            Console.WriteLine("Reparo silencioso iniciado.");
            InstallerForm.Validate(config);

            var backupDir = InstallerForm.CreateBackup();
            try
            {
                Console.WriteLine("Parando instalacao anterior, se existir...");
                InstallerForm.StopExistingProbe();
                Directory.CreateDirectory(InstallDir);

                Console.WriteLine("Copiando arquivos do collector...");
                InstallerForm.WriteResource("collector.js", Path.Combine(InstallDir, "collector.js"));
                InstallerForm.WriteResource("setup-server.js", Path.Combine(InstallDir, "setup-server.js"));
                InstallerForm.RemoveLegacyNodeRuntime();

                Console.WriteLine("Preparando runtime Node.js...");
                InstallerForm.EnsureNodeRuntime(config);

                Console.WriteLine("Salvando configuracao...");
                InstallerForm.WriteConfig(config);

                Console.WriteLine("Reconfigurando tarefa agendada...");
                InstallerForm.RegisterTask();

                Console.WriteLine("Iniciando Probe Collector...");
                InstallerForm.RunTask();

                Console.WriteLine("Registrando probe no ServerWatch...");
                InstallerForm.RegisterProbe(config);

                InstallerForm.RemoveBackup(backupDir);
            }
            catch
            {
                Console.Error.WriteLine("Falha no reparo; restaurando instalacao anterior...");
                InstallerForm.RestoreBackup(backupDir);
                throw;
            }

            Console.WriteLine("Reparo silencioso concluido com sucesso.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Falha no reparo silencioso: {error.Message}");
            return 1;
        }
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string ReadEmbeddedProbeCollectorVersion()
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream("collector.js");
        if (stream is null)
        {
            return "unknown";
        }

        using var reader = new StreamReader(stream);
        var collectorSource = reader.ReadToEnd();
        var match = Regex.Match(collectorSource, """const\s+VERSION\s*=\s*["'](?<version>[^"']+)["']""");
        return match.Success ? match.Groups["version"].Value : "unknown";
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

            var brandMark = new PictureBox
            {
                Image = LoadBrandWordmark(),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color("#0b2545"),
                Location = new Point(18, 16),
                Size = new Size(230, 68)
            };
            header.Controls.Add(brandMark);

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
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("serverwatch.ico");
            return stream is null ? SystemIcons.Application : new Icon(stream);
        }

        private static Image? LoadBrandWordmark()
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("serverwatch-wordmark.png");
            return stream is null ? null : Image.FromStream(stream);
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
                SetProgress(8, "Validando URL e token no ServerWatch...");
                ValidateServerWatch(values);
                SetProgress(14, "Criando backup da instalacao atual...");
                var backupDir = CreateBackup();
                try
                {
                    SetProgress(12, "Parando instalacao anterior, se existir...");
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
                    SetProgress(90, "Registrando probe no ServerWatch...");
                    RegisterProbe(values);
                    RemoveBackup(backupDir);
                }
                catch
                {
                    SetProgress(5, "Restaurando instalacao anterior...");
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

        internal static void Validate(ProbeConfig config)
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

        private static void ValidateServerWatch(ProbeConfig config)
        {
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

        internal static void RegisterProbe(ProbeConfig config)
        {
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

        internal static void WriteResource(string name, string destination)
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var input = assembly.GetManifestResourceStream(name)
                ?? throw new InvalidOperationException($"Recurso nao encontrado: {name}");
            using var output = File.Create(destination);
            input.CopyTo(output);
        }

        internal static void WriteConfig(ProbeConfig config)
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

        private static string EscapeXmlText(string value) =>
            value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

        internal static void RegisterTask()
        {
            var collectorPath = Path.Combine(InstallDir, "collector.js");
            var taskArguments = $"\"{collectorPath}\" --config \"{ConfigPath}\"";
            var xmlPath = Path.Combine(Path.GetTempPath(), $"serverwatch-probe-task-{Guid.NewGuid():N}.xml");
            var taskXml =
                "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\n" +
                "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\n" +
                "  <RegistrationInfo>\n" +
                "    <Description>ServerWatch Probe Collector</Description>\n" +
                "  </RegistrationInfo>\n" +
                "  <Triggers>\n" +
                "    <BootTrigger>\n" +
                "      <Enabled>true</Enabled>\n" +
                "    </BootTrigger>\n" +
                "  </Triggers>\n" +
                "  <Principals>\n" +
                "    <Principal id=\"Author\">\n" +
                "      <UserId>S-1-5-18</UserId>\n" +
                "      <RunLevel>HighestAvailable</RunLevel>\n" +
                "    </Principal>\n" +
                "  </Principals>\n" +
                "  <Settings>\n" +
                "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\n" +
                "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\n" +
                "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\n" +
                "    <AllowHardTerminate>true</AllowHardTerminate>\n" +
                "    <StartWhenAvailable>true</StartWhenAvailable>\n" +
                "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\n" +
                "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\n" +
                "    <Priority>7</Priority>\n" +
                "    <RestartOnFailure>\n" +
                "      <Interval>PT1M</Interval>\n" +
                "      <Count>999</Count>\n" +
                "    </RestartOnFailure>\n" +
                "  </Settings>\n" +
                "  <Actions Context=\"Author\">\n" +
                "    <Exec>\n" +
                $"      <Command>{EscapeXmlText(NodePath)}</Command>\n" +
                $"      <Arguments>{EscapeXmlText(taskArguments)}</Arguments>\n" +
                "    </Exec>\n" +
                "  </Actions>\n" +
                "</Task>\n";
            File.WriteAllText(xmlPath, taskXml, new System.Text.UnicodeEncoding(bigEndian: false, byteOrderMark: true));
            try
            {
                RunProcess("schtasks.exe", $"/Create /TN \"{TaskName}\" /XML \"{xmlPath}\" /F");
            }
            finally
            {
                try { File.Delete(xmlPath); } catch { /* best effort cleanup */ }
            }
        }

        internal static void RunTask()
        {
            RunProcess("schtasks.exe", $"/Run /TN \"{TaskName}\"");
        }

        internal static void StopExistingProbe()
        {
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

        internal static void EnsureNodeRuntime(ProbeConfig config)
        {
            if (File.Exists(NodePath))
            {
                ValidateNodeRuntime();
                return;
            }

            var tempRoot = Path.Combine(Path.GetTempPath(), $"ServerWatchProbeNode.{Guid.NewGuid():N}");
            var zipPath = Path.Combine(tempRoot, "node-runtime.zip");
            var extractDir = Path.Combine(tempRoot, "extract");
            try
            {
                Directory.CreateDirectory(tempRoot);
                DownloadRuntime(config, zipPath);

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

        internal static void RemoveLegacyNodeRuntime()
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

        internal static string? CreateBackup()
        {
            if (!Directory.Exists(InstallDir))
            {
                return null;
            }

            var backupDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                $"ServerWatchProbe.backup.{DateTime.Now:yyyyMMddHHmmss}"
            );
            CopyDirectory(InstallDir, backupDir);
            return backupDir;
        }

        internal static void RestoreBackup(string? backupDir)
        {
            if (string.IsNullOrWhiteSpace(backupDir) || !Directory.Exists(backupDir))
            {
                return;
            }

            try
            {
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
                Console.Error.WriteLine($"Nao foi possivel restaurar automaticamente: {error.Message}");
            }
        }

        internal static void RemoveBackup(string? backupDir)
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
