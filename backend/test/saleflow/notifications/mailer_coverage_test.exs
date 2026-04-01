defmodule Saleflow.Notifications.MailerCoverageTest do
  @moduledoc """
  Coverage tests for the Mailer module's non-sandbox code paths:
  - do_send/3 with 2xx response
  - do_send/3 with non-2xx response
  - do_send/3 with connection error
  - send_email_async/3 failure logging path
  """

  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Notifications.Mailer

  # A fake HTTP client module that records calls and returns configured responses.
  defmodule FakeHTTPSuccess do
    def post(_url, _opts) do
      {:ok, %{status: 200, body: %{"id" => "resend_123"}}}
    end
  end

  defmodule FakeHTTPError do
    def post(_url, _opts) do
      {:ok, %{status: 422, body: %{"error" => "validation_error"}}}
    end
  end

  defmodule FakeHTTPConnError do
    def post(_url, _opts) do
      {:error, %Req.TransportError{reason: :econnrefused}}
    end
  end

  setup do
    original_sandbox = Application.get_env(:saleflow, :mailer_sandbox)
    original_client = Application.get_env(:saleflow, :http_client)

    on_exit(fn ->
      Application.put_env(:saleflow, :mailer_sandbox, original_sandbox)

      if original_client do
        Application.put_env(:saleflow, :http_client, original_client)
      else
        Application.delete_env(:saleflow, :http_client)
      end
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # do_send/3 — success (2xx)
  # ---------------------------------------------------------------------------

  describe "do_send/3 with 2xx response" do
    test "returns {:ok, resend_id}" do
      Application.put_env(:saleflow, :mailer_sandbox, false)
      Application.put_env(:saleflow, :http_client, FakeHTTPSuccess)

      assert {:ok, "resend_123"} =
               Mailer.send_email("test@example.com", "Subject", "<p>Body</p>")
    end
  end

  # ---------------------------------------------------------------------------
  # do_send/3 — non-2xx
  # ---------------------------------------------------------------------------

  describe "do_send/3 with non-2xx response" do
    test "returns {:error, {status, body}}" do
      Application.put_env(:saleflow, :mailer_sandbox, false)
      Application.put_env(:saleflow, :http_client, FakeHTTPError)

      assert {:error, {422, %{"error" => "validation_error"}}} =
               Mailer.send_email("test@example.com", "Subject", "<p>Body</p>")
    end
  end

  # ---------------------------------------------------------------------------
  # do_send/3 — connection error
  # ---------------------------------------------------------------------------

  describe "do_send/3 with connection error" do
    test "returns {:error, reason}" do
      Application.put_env(:saleflow, :mailer_sandbox, false)
      Application.put_env(:saleflow, :http_client, FakeHTTPConnError)

      assert {:error, %Req.TransportError{reason: :econnrefused}} =
               Mailer.send_email("test@example.com", "Subject", "<p>Body</p>")
    end
  end

  # ---------------------------------------------------------------------------
  # send_email_async/3 — failure logging path
  # ---------------------------------------------------------------------------

  describe "send_email_async/3 failure logging path" do
    test "logs warning when send_email returns error" do
      Application.put_env(:saleflow, :mailer_sandbox, false)
      Application.put_env(:saleflow, :http_client, FakeHTTPConnError)

      log =
        capture_log([level: :warning], fn ->
          Mailer.send_email_async("fail@example.com", "Fail Subject", "<p>fail</p>")
          # Give the async task time to complete
          Process.sleep(100)
        end)

      assert log =~ "Failed to send email"
      assert log =~ "fail@example.com"
    end
  end
end
