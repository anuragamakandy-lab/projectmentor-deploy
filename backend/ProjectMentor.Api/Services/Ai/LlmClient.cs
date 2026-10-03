using System.Net.Http.Json;
using System.Text.Json;

namespace ProjectMentor.Api.Services.Ai;

/// <summary>
/// Thin, backend-only wrapper around the Google Gemini REST API. This is the single place the
/// whole app talks to an LLM — agents call it, clients never do. It applies a timeout, retries a
/// few times on transient overload, and fails safely with a clear message when unconfigured.
/// </summary>
public sealed class LlmClient
{
    private readonly HttpClient _http;
    private readonly SettingsService _settings;

    public LlmClient(HttpClient http, SettingsService settings)
    {
        _http = http;
        _settings = settings;
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    // Read on every call so a key changed in the admin "System settings" page works immediately.
    private string? _apiKey => _settings.Get("GEMINI_API_KEY");
    private string _model => _settings.Get("GEMINI_MODEL") ?? "gemini-flash-lite-latest";

    /// <summary>True once a Gemini API key is present, so callers can degrade gracefully.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    /// <summary>Ask the model for a JSON answer. Returns the raw JSON text (caller parses/validates).</summary>
    public Task<string> CompleteJsonAsync(string systemPrompt, string userPrompt, CancellationToken cancellationToken, double temperature = 0.9)
    {
        var payload = new
        {
            systemInstruction = new { parts = new[] { new { text = systemPrompt } } },
            contents = new[] { new { role = "user", parts = new[] { new { text = userPrompt } } } },
            generationConfig = new { responseMimeType = "application/json", temperature }
        };
        return SendAsync(payload, cancellationToken);
    }

    /// <summary>Multi-turn free-text chat. Turns use role "user" or "model" (assistant).</summary>
    public Task<string> CompleteChatAsync(string systemPrompt, IReadOnlyList<(string Role, string Text)> turns, CancellationToken cancellationToken)
    {
        var contents = turns.Select(t => new
        {
            role = t.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase) || t.Role.Equals("model", StringComparison.OrdinalIgnoreCase) ? "model" : "user",
            parts = new[] { new { text = t.Text } }
        }).ToArray();

        var payload = new
        {
            systemInstruction = new { parts = new[] { new { text = systemPrompt } } },
            contents,
            generationConfig = new { temperature = 0.8 }
        };
        return SendAsync(payload, cancellationToken);
    }

    private async Task<string> SendAsync(object payload, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            throw new AiUnavailableException("The AI service is not configured. An admin can add the Gemini API key in Admin → System settings.");

        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

        const int maxAttempts = 4;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                var response = await _http.PostAsJsonAsync(url, payload, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var transient = (int)response.StatusCode is 503 or 429 or 500;
                    if (attempt == maxAttempts || !transient)
                        throw new AiUnavailableException($"The AI request failed (HTTP {(int)response.StatusCode}). Please try again.");
                    await Task.Delay(400 * attempt, cancellationToken);
                    continue;
                }

                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
                var text = doc.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text")
                    .GetString();

                if (string.IsNullOrWhiteSpace(text))
                    throw new AiUnavailableException("The AI returned an empty response.");
                return text;
            }
            // HttpClient.Timeout surfaces as TaskCanceledException; only a cancelled *request* should escape as cancellation.
            catch (Exception ex) when (ex is not AiUnavailableException && !cancellationToken.IsCancellationRequested)
            {
                if (ex is TaskCanceledException) // already waited the full timeout: a retry would double the wait, so let the caller fall back
                    throw new AiUnavailableException("The AI took too long to answer. Please try again.", ex);
                if (attempt == maxAttempts)
                    throw new AiUnavailableException("The AI service could not be reached.", ex);
                await Task.Delay(400 * attempt, cancellationToken);
            }
        }

        throw new AiUnavailableException("The AI service could not be reached.");
    }
}

/// <summary>Raised when the LLM is unconfigured, unreachable, or returns something unusable.</summary>
public sealed class AiUnavailableException : Exception
{
    public AiUnavailableException(string message) : base(message) { }
    public AiUnavailableException(string message, Exception inner) : base(message, inner) { }
}
