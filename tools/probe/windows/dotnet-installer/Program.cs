using System.Diagnostics;
using System.Reflection;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ServerWatchProbeSetup;

internal static class Program
{
    private const string TaskName = "ServerWatch Probe Collector";
    private static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "ServerWatchProbe"
    );
    private static readonly string ConfigPath = Path.Combine(InstallDir, "config.json");

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        if (!IsAdministrator())
        {
            MessageBox.Show(
                "Execute o instalador como Administrador.",
                "ServerWatch Probe Collector",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
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
        private readonly Button installButton = new();

        public InstallerForm()
        {
            Text = "ServerWatch Probe Collector";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(560, 430);
            Font = new Font("Segoe UI", 9);

            var title = new Label
            {
                Text = "Instalar ServerWatch Probe Collector",
                Font = new Font("Segoe UI", 13, FontStyle.Bold),
                Location = new Point(22, 18),
                Size = new Size(500, 26)
            };
            Controls.Add(title);

            var subtitle = new Label
            {
                Text = "Configure o coletor local que enviara resultados para o ServerWatch central.",
                Location = new Point(24, 50),
                Size = new Size(500, 22)
            };
            Controls.Add(subtitle);

            AddLabel("URL do ServerWatch", 24, 92);
            ConfigureTextBox(serverUrl, 24, 114, 510);

            AddLabel("ID do probe", 24, 152);
            ConfigureTextBox(probeId, 24, 174, 240);

            AddLabel("Nome", 294, 152);
            ConfigureTextBox(probeName, 294, 174, 240);

            AddLabel("Token", 24, 212);
            ConfigureTextBox(token, 24, 234, 510);
            token.UseSystemPasswordChar = true;

            AddLabel("Intervalo em segundos", 24, 272);
            ConfigureNumber(intervalSeconds, 24, 294, 120, 3, 3600, 10);

            AddLabel("Timeout em ms", 174, 272);
            ConfigureNumber(timeoutMs, 174, 294, 120, 500, 60000, 2500);

            status.Location = new Point(24, 340);
            status.Size = new Size(510, 42);
            status.Text = $"O probe sera instalado em {InstallDir}.";
            Controls.Add(status);

            installButton.Text = "Instalar e iniciar";
            installButton.Location = new Point(374, 386);
            installButton.Size = new Size(160, 30);
            installButton.Click += (_, _) => Install();
            Controls.Add(installButton);

            var cancelButton = new Button
            {
                Text = "Cancelar",
                Location = new Point(262, 386),
                Size = new Size(100, 30)
            };
            cancelButton.Click += (_, _) => Close();
            Controls.Add(cancelButton);

            LoadExistingConfig();
        }

        private void AddLabel(string text, int x, int y)
        {
            Controls.Add(new Label
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(210, 20)
            });
        }

        private void ConfigureTextBox(TextBox box, int x, int y, int width)
        {
            box.Location = new Point(x, y);
            box.Size = new Size(width, 24);
            Controls.Add(box);
        }

        private void ConfigureNumber(NumericUpDown box, int x, int y, int width, int minimum, int maximum, int value)
        {
            box.Location = new Point(x, y);
            box.Size = new Size(width, 24);
            box.Minimum = minimum;
            box.Maximum = maximum;
            box.Value = value;
            Controls.Add(box);
        }

        private void LoadExistingConfig()
        {
            if (!File.Exists(ConfigPath))
            {
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
            installButton.Enabled = false;
            status.Text = "Instalando...";

            try
            {
                var values = ReadValues();
                Validate(values);
                Directory.CreateDirectory(InstallDir);

                WriteResource("collector.js", Path.Combine(InstallDir, "collector.js"));
                WriteResource("setup-server.js", Path.Combine(InstallDir, "setup-server.js"));
                WriteResource("node.exe", Path.Combine(InstallDir, "node.exe"));
                WriteConfig(values);
                RegisterTask();
                RunTask();

                status.Text = "Instalacao concluida. A tarefa agendada ja foi iniciada.";
                MessageBox.Show(
                    "ServerWatch Probe Collector instalado e iniciado com sucesso.",
                    "ServerWatch Probe Collector",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                Close();
            }
            catch (Exception error)
            {
                status.Text = error.Message;
                MessageBox.Show(error.Message, "Erro na instalacao", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                installButton.Enabled = true;
            }
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
            var nodePath = Path.Combine(InstallDir, "node.exe");
            var collectorPath = Path.Combine(InstallDir, "collector.js");
            var taskCommand = $"\"{nodePath}\" \"{collectorPath}\" --config \"{ConfigPath}\"";
            RunProcess(
                "schtasks.exe",
                $"/Create /TN \"{TaskName}\" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR \"{taskCommand}\" /F"
            );
        }

        private static void RunTask()
        {
            RunProcess("schtasks.exe", $"/Run /TN \"{TaskName}\"");
        }

        private static void RunProcess(string fileName, string arguments)
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

            if (process.ExitCode != 0)
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
