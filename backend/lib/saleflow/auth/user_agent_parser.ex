defmodule Saleflow.Auth.UserAgentParser do
  @moduledoc """
  Simple regex-based user agent parser.

  Detects device type (mobile/tablet/desktop) and browser name+version
  from a raw User-Agent string.
  """

  @doc """
  Parses a user agent string and returns a map with `:device_type` and `:browser`.

  ## Examples

      iex> Saleflow.Auth.UserAgentParser.parse("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0")
      %{device_type: "desktop", browser: "Chrome 120"}

      iex> Saleflow.Auth.UserAgentParser.parse(nil)
      %{device_type: "unknown", browser: "unknown"}
  """
  def parse(ua_string) when is_binary(ua_string) do
    %{
      device_type: detect_device_type(ua_string),
      browser: detect_browser(ua_string)
    }
  end

  def parse(_), do: %{device_type: "unknown", browser: "unknown"}

  defp detect_device_type(ua) do
    cond do
      Regex.match?(~r/iPhone|Android.*Mobile/i, ua) -> "mobile"
      Regex.match?(~r/iPad|Android(?!.*Mobile)|Tablet/i, ua) -> "tablet"
      true -> "desktop"
    end
  end

  defp detect_browser(ua) do
    cond do
      match = Regex.run(~r/Edg(?:e)?\/([\d]+)/, ua) ->
        "Edge #{Enum.at(match, 1)}"

      match = Regex.run(~r/Chrome\/([\d]+)/, ua) ->
        "Chrome #{Enum.at(match, 1)}"

      match = Regex.run(~r/Firefox\/([\d]+)/, ua) ->
        "Firefox #{Enum.at(match, 1)}"

      match = Regex.run(~r/Version\/([\d]+).*Safari\//, ua) ->
        "Safari #{Enum.at(match, 1)}"

      true ->
        "unknown"
    end
  end
end
