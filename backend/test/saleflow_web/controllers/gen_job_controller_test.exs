defmodule SaleflowWeb.GenJobControllerTest do
  @moduledoc """
  Tests for the GenJobController — GenFlow API endpoints.
  """

  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Generation

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp authed_conn(conn) do
    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("x-genflow-key", "dev-genflow-key")
  end

  defp create_pending_job!(overrides \\ %{}) do
    params =
      Map.merge(
        %{source_url: "https://example.se", slug: "example-se"},
        overrides
      )

    {:ok, job} = Generation.create_job(params)
    job
  end

  # ---------------------------------------------------------------------------
  # Authentication
  # ---------------------------------------------------------------------------

  describe "authentication" do
    test "rejects request without API key", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> get("/api/gen-jobs/pending")

      assert json_response(conn, 401)["error"] == "Invalid API key"
    end

    test "rejects request with wrong API key", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-genflow-key", "wrong-key")
        |> get("/api/gen-jobs/pending")

      assert json_response(conn, 401)["error"] == "Invalid API key"
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/gen-jobs/pending
  # ---------------------------------------------------------------------------

  describe "GET /api/gen-jobs/pending" do
    test "returns job when available", %{conn: conn} do
      job = create_pending_job!()

      conn =
        conn
        |> authed_conn()
        |> get("/api/gen-jobs/pending")

      resp = json_response(conn, 200)
      assert resp["job"]["id"] == job.id
      assert resp["job"]["status"] == "pending"
      assert resp["job"]["source_url"] == "https://example.se"
      assert resp["job"]["slug"] == "example-se"
    end

    test "returns null when no pending jobs", %{conn: conn} do
      conn =
        conn
        |> authed_conn()
        |> get("/api/gen-jobs/pending")

      resp = json_response(conn, 200)
      assert resp["job"] == nil
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/gen-jobs/:id/pick
  # ---------------------------------------------------------------------------

  describe "POST /api/gen-jobs/:id/pick" do
    test "marks job as processing", %{conn: conn} do
      job = create_pending_job!()

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{job.id}/pick")

      resp = json_response(conn, 200)
      assert resp["job"]["id"] == job.id
      assert resp["job"]["status"] == "processing"
      assert resp["job"]["picked_up_at"] != nil
    end

    test "returns 422 for non-existent job", %{conn: conn} do
      fake_id = Ecto.UUID.generate()

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{fake_id}/pick")

      assert json_response(conn, 422)["error"] == "Could not pick job"
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/gen-jobs/:id/complete
  # ---------------------------------------------------------------------------

  describe "POST /api/gen-jobs/:id/complete" do
    test "saves result_url and marks as completed", %{conn: conn} do
      job = create_pending_job!()
      {:ok, picked} = Generation.pick_job(job)

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{picked.id}/complete", %{
          result_url: "https://cdn.example.se/sites/demo-123"
        })

      resp = json_response(conn, 200)
      assert resp["job"]["status"] == "completed"
      assert resp["job"]["result_url"] == "https://cdn.example.se/sites/demo-123"
      assert resp["job"]["completed_at"] != nil
    end

    test "returns 422 for non-existent job", %{conn: conn} do
      fake_id = Ecto.UUID.generate()

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{fake_id}/complete", %{result_url: "https://example.se"})

      assert json_response(conn, 422)["error"] == "Could not complete job"
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/gen-jobs/:id/fail
  # ---------------------------------------------------------------------------

  describe "POST /api/gen-jobs/:id/fail" do
    test "saves error and marks as failed", %{conn: conn} do
      job = create_pending_job!()
      {:ok, picked} = Generation.pick_job(job)

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{picked.id}/fail", %{error: "Claude crashed with exit code 1"})

      resp = json_response(conn, 200)
      assert resp["job"]["status"] == "failed"
      assert resp["job"]["error"] == "Claude crashed with exit code 1"
      assert resp["job"]["completed_at"] != nil
    end

    test "returns 422 for non-existent job", %{conn: conn} do
      fake_id = Ecto.UUID.generate()

      conn =
        conn
        |> authed_conn()
        |> post("/api/gen-jobs/#{fake_id}/fail", %{error: "some error"})

      assert json_response(conn, 422)["error"] == "Could not fail job"
    end
  end
end
