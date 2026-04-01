defmodule SaleflowWeb.ImportControllerTest do
  @moduledoc """
  Tests for ImportController.

  The import route is mounted under /api/admin/import and requires admin auth.
  These tests focus on the ImportController action dispatch logic.
  """

  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts

  @admin_params %{
    email: "admin_import@example.com",
    name: "Admin Import",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    conn = log_in_user(conn, admin)
    %{conn: conn, admin: admin}
  end

  describe "POST /api/admin/import" do
    test "returns 400 when no file param is sent", %{conn: conn} do
      conn = post(conn, "/api/admin/import", %{})
      assert %{"error" => "file upload is required"} = json_response(conn, 400)
    end

    test "returns 400 when file param is not a Plug.Upload", %{conn: conn} do
      conn = post(conn, "/api/admin/import", %{"file" => "not-a-file"})
      assert json_response(conn, 400)
    end

    test "imports from a valid xlsx file", %{conn: conn} do
      xlsx_path = Path.join([File.cwd!(), "test", "fixtures", "leads.xlsx"])

      upload = %Plug.Upload{
        path: xlsx_path,
        filename: "leads.xlsx",
        content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }

      conn = post(conn, "/api/admin/import", %{"file" => upload})
      assert %{"created" => created, "skipped" => skipped} = json_response(conn, 201)
      assert is_integer(created)
      assert is_integer(skipped)
      assert created > 0
    end

    test "returns 422 when file path does not exist", %{conn: conn} do
      upload = %Plug.Upload{
        path: "/tmp/definitely_nonexistent_#{System.unique_integer()}.xlsx",
        filename: "bad.xlsx",
        content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }

      conn = post(conn, "/api/admin/import", %{"file" => upload})
      assert json_response(conn, 422)
    end
  end
end
