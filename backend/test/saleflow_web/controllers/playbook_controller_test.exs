defmodule SaleflowWeb.PlaybookControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts

  @admin_params %{
    email: "admin-playbook@example.com",
    name: "Admin Playbook",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agent-playbook@example.com",
    name: "Agent Playbook",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  # ---------------------------------------------------------------------------
  # POST /api/admin/playbooks — create
  # ---------------------------------------------------------------------------

  describe "POST /api/admin/playbooks" do
    test "admin creates a playbook", %{conn: conn, admin: admin} do
      resp =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/playbooks", %{
          name: "Standard B2B",
          opening: "Hej, jag ringer från...",
          pitch: "Vi hjälper företag med...",
          objections: "Om kunden säger nej...",
          closing: "Boka möte",
          guidelines: "Var vänlig och professionell",
          active: true
        })
        |> json_response(200)

      assert resp["ok"] == true
      assert resp["id"] != nil
    end

    test "agent cannot create playbook (403)", %{conn: conn, agent: agent} do
      conn
      |> log_in_user(agent)
      |> post("/api/admin/playbooks", %{name: "Test"})
      |> json_response(403)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/admin/playbooks — index
  # ---------------------------------------------------------------------------

  describe "GET /api/admin/playbooks" do
    test "lists all playbooks", %{conn: conn, admin: admin} do
      # Create two playbooks
      conn
      |> log_in_user(admin)
      |> post("/api/admin/playbooks", %{name: "First", opening: "a", pitch: "b", objections: "c", closing: "d", guidelines: "e", active: false})
      |> json_response(200)

      conn
      |> log_in_user(admin)
      |> post("/api/admin/playbooks", %{name: "Second", opening: "f", pitch: "g", objections: "h", closing: "i", guidelines: "j", active: true})
      |> json_response(200)

      resp =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks")
        |> json_response(200)

      assert length(resp["playbooks"]) == 2
      names = Enum.map(resp["playbooks"], & &1["name"])
      assert "First" in names
      assert "Second" in names
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/admin/playbooks/active — active
  # ---------------------------------------------------------------------------

  describe "GET /api/admin/playbooks/active" do
    test "returns active playbook", %{conn: conn, admin: admin} do
      conn
      |> log_in_user(admin)
      |> post("/api/admin/playbooks", %{name: "Active One", opening: "hi", pitch: "p", objections: "o", closing: "c", guidelines: "g", active: true})
      |> json_response(200)

      resp =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks/active")
        |> json_response(200)

      assert resp["playbook"]["name"] == "Active One"
      assert resp["playbook"]["active"] == true
    end

    test "returns nil when no active playbook", %{conn: conn, admin: admin} do
      resp =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks/active")
        |> json_response(200)

      assert resp["playbook"] == nil
    end
  end

  # ---------------------------------------------------------------------------
  # PUT /api/admin/playbooks/:id — update
  # ---------------------------------------------------------------------------

  describe "PUT /api/admin/playbooks/:id" do
    test "updates a playbook", %{conn: conn, admin: admin} do
      %{"id" => id} =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/playbooks", %{name: "Old Name", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false})
        |> json_response(200)

      resp =
        conn
        |> log_in_user(admin)
        |> put("/api/admin/playbooks/#{id}", %{name: "New Name", opening: "new", pitch: "new", objections: "new", closing: "new", guidelines: "new", active: false})
        |> json_response(200)

      assert resp["ok"] == true

      # Verify the update
      list =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks")
        |> json_response(200)

      updated = Enum.find(list["playbooks"], &(&1["id"] == id))
      assert updated["name"] == "New Name"
      assert updated["opening"] == "new"
    end

    test "setting active deactivates others", %{conn: conn, admin: admin} do
      %{"id" => id1} =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/playbooks", %{name: "PB1", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: true})
        |> json_response(200)

      %{"id" => id2} =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/playbooks", %{name: "PB2", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false})
        |> json_response(200)

      # Activate PB2 — PB1 should be deactivated
      conn
      |> log_in_user(admin)
      |> put("/api/admin/playbooks/#{id2}", %{name: "PB2", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: true})
      |> json_response(200)

      list =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks")
        |> json_response(200)

      pb1 = Enum.find(list["playbooks"], &(&1["id"] == id1))
      pb2 = Enum.find(list["playbooks"], &(&1["id"] == id2))
      assert pb1["active"] == false
      assert pb2["active"] == true
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/admin/playbooks/:id — delete
  # ---------------------------------------------------------------------------

  describe "DELETE /api/admin/playbooks/:id" do
    test "deletes a playbook", %{conn: conn, admin: admin} do
      %{"id" => id} =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/playbooks", %{name: "Delete Me", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false})
        |> json_response(200)

      resp =
        conn
        |> log_in_user(admin)
        |> delete("/api/admin/playbooks/#{id}")
        |> json_response(200)

      assert resp["ok"] == true

      # Verify it's gone
      list =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/playbooks")
        |> json_response(200)

      assert Enum.find(list["playbooks"], &(&1["id"] == id)) == nil
    end
  end
end
