defmodule Saleflow.Notifications.Mailer do
  @moduledoc """
  Sends transactional emails via the Resend API.

  ## Sandbox mode

  When `:mailer_sandbox` is `true` (set automatically in the test environment),
  no HTTP requests are made. The email payload is logged at the `:info` level
  and `{:ok, "sandbox"}` is returned.

  ## Usage

      # Synchronous — returns {:ok, id} | {:error, reason}
      Saleflow.Notifications.Mailer.send_email(
        "user@example.se",
        "Your OTP code",
        html_body
      )

      # Asynchronous — always returns :ok, logs on failure
      Saleflow.Notifications.Mailer.send_email_async(
        "user@example.se",
        "Your OTP code",
        html_body
      )
  """

  require Logger

  @resend_url "https://api.resend.com/emails"

  @doc """
  Sends an email synchronously.

  Returns `{:ok, resend_id}` on success, `{:error, reason}` on failure.
  In sandbox mode returns `{:ok, "sandbox"}` without making any HTTP call.
  """
  @spec send_email(String.t(), String.t(), String.t()) ::
          {:ok, String.t()} | {:error, term()}
  def send_email(to, subject, html_body) do
    if sandbox?() do
      Logger.warning("[Mailer sandbox] to=#{to} subject=#{subject}\n#{html_body}")
      {:ok, "sandbox"}
    else
      do_send(to, subject, html_body)
    end
  end

  @doc """
  Sends an email asynchronously via `Task.start/1`.

  Always returns `:ok` immediately. Any delivery failure is logged as a
  `:warning`. Use this for fire-and-forget notifications where a delivery
  failure must not block the caller.
  """
  @spec send_email_async(String.t(), String.t(), String.t()) :: :ok
  def send_email_async(to, subject, html_body) do
    Task.start(fn ->
      case send_email(to, subject, html_body) do
        {:ok, _} ->
          :ok

        {:error, reason} ->
          Logger.warning("[Mailer] Failed to send email to #{to}: #{inspect(reason)}")
      end
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  @doc false
  def do_send(to, subject, html_body) do
    api_key = Application.get_env(:saleflow, :resend_api_key)
    from = Application.get_env(:saleflow, :resend_from, "Saleflow <noreply@siteflow.se>")

    payload = %{
      from: from,
      to: [to],
      subject: subject,
      html: html_body
    }

    case http_post(@resend_url,
           json: payload,
           headers: [{"authorization", "Bearer #{api_key}"}]
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        id = Map.get(body, "id", "unknown")
        {:ok, id}

      {:ok, %{status: status, body: body}} ->
        {:error, {status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp http_post(url, opts) do
    http_client().post(url, opts)
  end

  defp http_client do
    Application.get_env(:saleflow, :http_client, Req)
  end

  defp sandbox? do
    Application.get_env(:saleflow, :mailer_sandbox, false)
  end
end
