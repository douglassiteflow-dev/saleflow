defmodule Saleflow.AssemblyAI.ClientTest do
  use ExUnit.Case, async: true

  alias Saleflow.AssemblyAI.Client

  # ---------------------------------------------------------------------------
  # Helpers — stub a single Req.Test response for this process
  # ---------------------------------------------------------------------------

  defp stub(fun), do: Req.Test.stub(Saleflow.AssemblyAI.Client, fun)

  defp json_200(body) do
    fn conn -> Req.Test.json(conn, body) end
  end

  defp json_status(status, body) do
    fn conn ->
      conn = Plug.Conn.put_status(conn, status)
      Req.Test.json(conn, body)
    end
  end

  # ---------------------------------------------------------------------------
  # Module structure
  # ---------------------------------------------------------------------------

  describe "module structure" do
    test "implements ClientBehaviour" do
      behaviours =
        Client.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Saleflow.AssemblyAI.ClientBehaviour in behaviours
    end

    test "exports transcribe/2" do
      assert function_exported?(Client, :transcribe, 2)
    end

    test "exports get_transcript/1" do
      assert function_exported?(Client, :get_transcript, 1)
    end

    test "exports poll_until_complete/1" do
      assert function_exported?(Client, :poll_until_complete, 1)
    end

    test "exports lemur_task/3" do
      assert function_exported?(Client, :lemur_task, 3)
    end
  end

  describe "MockClient" do
    test "mock is defined and implements behaviour" do
      behaviours =
        Saleflow.AssemblyAI.MockClient.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Saleflow.AssemblyAI.ClientBehaviour in behaviours
    end
  end

  # ---------------------------------------------------------------------------
  # transcribe/2
  # ---------------------------------------------------------------------------

  describe "transcribe/2" do
    test "returns {:ok, transcript_id} when API returns an id" do
      stub(json_200(%{"id" => "abc123"}))

      assert {:ok, "abc123"} = Client.transcribe("https://example.com/audio.mp3")
    end

    test "merges opts into the request body (no HTTP assertion, just checks no crash)" do
      stub(json_200(%{"id" => "xyz"}))

      assert {:ok, "xyz"} =
               Client.transcribe("https://example.com/a.mp3", %{language_code: "sv"})
    end

    test "returns {:error, {:unexpected_response, body}} when id is missing" do
      stub(json_200(%{"status" => "queued"}))

      assert {:error, {:unexpected_response, %{"status" => "queued"}}} =
               Client.transcribe("https://example.com/audio.mp3")
    end

    test "returns {:error, :unauthorized} on 401" do
      stub(json_status(401, %{"error" => "Unauthorized"}))

      assert {:error, :unauthorized} = Client.transcribe("https://example.com/audio.mp3")
    end

    test "returns {:error, {:http, status, body}} on other HTTP error" do
      stub(json_status(422, %{"error" => "invalid_url"}))

      assert {:error, {:http, 422, %{"error" => "invalid_url"}}} =
               Client.transcribe("https://example.com/audio.mp3")
    end

    test "returns {:error, reason} on transport error" do
      stub(fn conn -> Req.Test.transport_error(conn, :econnrefused) end)

      assert {:error, %Req.TransportError{reason: :econnrefused}} =
               Client.transcribe("https://example.com/audio.mp3")
    end
  end

  # ---------------------------------------------------------------------------
  # get_transcript/1
  # ---------------------------------------------------------------------------

  describe "get_transcript/1" do
    test "returns {:ok, body} for a completed transcript" do
      body = %{"id" => "t1", "status" => "completed", "text" => "Hello world"}
      stub(json_200(body))

      assert {:ok, ^body} = Client.get_transcript("t1")
    end

    test "returns {:ok, body} for a processing transcript" do
      body = %{"id" => "t1", "status" => "processing"}
      stub(json_200(body))

      assert {:ok, ^body} = Client.get_transcript("t1")
    end

    test "returns {:ok, body} for an error transcript" do
      body = %{"id" => "t1", "status" => "error", "error" => "audio_too_short"}
      stub(json_200(body))

      assert {:ok, ^body} = Client.get_transcript("t1")
    end

    test "returns {:error, :unauthorized} on 401" do
      stub(json_status(401, %{}))

      assert {:error, :unauthorized} = Client.get_transcript("t1")
    end

    test "returns {:error, {:http, status, body}} on 404" do
      stub(json_status(404, %{"error" => "not_found"}))

      assert {:error, {:http, 404, %{"error" => "not_found"}}} = Client.get_transcript("t1")
    end

    test "returns {:error, reason} on transport error" do
      stub(fn conn -> Req.Test.transport_error(conn, :timeout) end)

      assert {:error, %Req.TransportError{reason: :timeout}} = Client.get_transcript("t1")
    end
  end

  # ---------------------------------------------------------------------------
  # poll_until_complete/1
  # ---------------------------------------------------------------------------

  describe "poll_until_complete/1" do
    test "returns {:ok, body} immediately when status is completed" do
      body = %{"id" => "t1", "status" => "completed", "text" => "Done"}
      stub(json_200(body))

      assert {:ok, ^body} = Client.poll_until_complete("t1")
    end

    test "returns {:error, {:transcription_failed, reason}} when status is error" do
      body = %{"id" => "t1", "status" => "error", "error" => "audio_too_short"}
      stub(json_200(body))

      assert {:error, {:transcription_failed, "audio_too_short"}} =
               Client.poll_until_complete("t1")
    end

    test "retries on processing then returns completed" do
      # First call returns processing, second returns completed
      Req.Test.expect(Saleflow.AssemblyAI.Client, 2, fn conn ->
        # Use agent to track call count
        call = Process.get(:poll_call_count, 0)
        Process.put(:poll_call_count, call + 1)

        if call == 0 do
          Req.Test.json(conn, %{"status" => "processing"})
        else
          Req.Test.json(conn, %{"status" => "completed", "text" => "ok"})
        end
      end)

      assert {:ok, %{"status" => "completed"}} = Client.poll_until_complete("t1")
    end

    test "returns {:error, reason} when HTTP request fails during polling" do
      stub(fn conn -> Req.Test.transport_error(conn, :econnrefused) end)

      assert {:error, %Req.TransportError{reason: :econnrefused}} =
               Client.poll_until_complete("t1")
    end

    test "returns {:error, :timeout} after max poll attempts are exhausted" do
      # Stub 120 consecutive processing responses — poll interval is 0ms in test env
      Req.Test.expect(Saleflow.AssemblyAI.Client, 120, fn conn ->
        Req.Test.json(conn, %{"status" => "processing"})
      end)

      assert {:error, :timeout} = Client.poll_until_complete("t1")
    end
  end

  # ---------------------------------------------------------------------------
  # lemur_task/3
  # ---------------------------------------------------------------------------

  describe "lemur_task/3" do
    test "returns {:ok, response_map} on success" do
      body = %{"request_id" => "r1", "response" => "The call went well."}
      stub(json_200(body))

      assert {:ok, %{"response" => "The call went well.", "request_id" => "r1"}} =
               Client.lemur_task(["t1"], "Summarize the call", %{})
    end

    test "returns {:ok, response_map} with extra opts merged into request" do
      body = %{"response" => "Summary here"}
      stub(json_200(body))

      assert {:ok, %{"response" => "Summary here"}} =
               Client.lemur_task(["t1", "t2"], "What happened?", %{final_model: "default"})
    end

    test "returns {:error, {:unexpected_response, body}} when response key is missing" do
      body = %{"request_id" => "r1"}
      stub(json_200(body))

      assert {:error, {:unexpected_response, %{"request_id" => "r1"}}} =
               Client.lemur_task(["t1"], "Summarize", %{})
    end

    test "returns {:error, :unauthorized} on 401" do
      stub(json_status(401, %{}))

      assert {:error, :unauthorized} = Client.lemur_task(["t1"], "Summarize", %{})
    end

    test "returns {:error, {:http, status, body}} on API error" do
      stub(json_status(400, %{"error" => "invalid_transcript_ids"}))

      assert {:error, {:http, 400, %{"error" => "invalid_transcript_ids"}}} =
               Client.lemur_task(["bad_id"], "Summarize", %{})
    end

    test "returns {:error, reason} on transport error" do
      stub(fn conn -> Req.Test.transport_error(conn, :econnrefused) end)

      assert {:error, %Req.TransportError{reason: :econnrefused}} =
               Client.lemur_task(["t1"], "Summarize", %{})
    end
  end
end
