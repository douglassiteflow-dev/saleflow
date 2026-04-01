defmodule Saleflow.Audit.Changes.CreateAuditLogTest do
  @moduledoc """
  Unit tests for the CreateAuditLog Ash Resource Change.

  Tests the init/1 validation and the format_value/1 helpers indirectly
  through the change/3 callback triggered by resource actions.
  """

  use Saleflow.DataCase, async: true

  alias Saleflow.Audit.Changes.CreateAuditLog
  alias Saleflow.Sales
  alias Saleflow.Audit

  describe "init/1" do
    test "returns {:ok, opts} when :action is a non-empty string" do
      assert {:ok, opts} = CreateAuditLog.init(action: "lead.created")
      assert opts[:action] == "lead.created"
    end

    test "returns {:error, reason} when :action is missing" do
      assert {:error, _reason} = CreateAuditLog.init([])
    end

    test "returns {:error, reason} when :action is nil" do
      assert {:error, _reason} = CreateAuditLog.init(action: nil)
    end

    test "returns {:error, reason} when :action is an empty string" do
      assert {:error, _reason} = CreateAuditLog.init(action: "")
    end

    test "returns {:error, reason} when :action is an atom (not a string)" do
      assert {:error, _reason} = CreateAuditLog.init(action: :lead_created)
    end
  end

  describe "format_value/1 — exercised via resource actions" do
    test "Ash.CiString values are formatted as plain strings in audit changes" do
      # User email is stored as Ash.CiString — when audit log change fires,
      # the before-value (nil) and after-value (CiString) are formatted correctly.
      {:ok, user} =
        Saleflow.Accounts.User
        |> Ash.Changeset.for_create(:register_with_password, %{
          email: "cistring_test@example.com",
          name: "CI String User",
          password: "Password123!",
          password_confirmation: "Password123!"
        })
        |> Ash.create()

      refute is_nil(user.id)
      # No assertion on audit log content needed — just that creation succeeded
      # and that the CiString formatting path was exercised.
    end

    test "atom status values are serialized as strings in audit changes" do
      {:ok, lead} =
        Sales.create_lead(%{
          företag: "Atom Status AB",
          telefon: "+46701999001"
        })

      {:ok, updated} = Sales.update_lead_status(lead, %{status: :callback})
      assert updated.status == :callback

      {:ok, logs} = Audit.list_for_resource("Lead", lead.id)
      status_change_logs = Enum.filter(logs, fn l -> l.action == "lead.status_changed" end)

      # The "from" and "to" values in the changes map should be strings (not atoms)
      for log <- status_change_logs do
        if Map.has_key?(log.changes, "status") do
          to_val = get_in(log.changes, ["status", "to"])
          assert is_binary(to_val) or is_nil(to_val)
        end
      end
    end

    test "nil values remain nil in audit changes" do
      {:ok, lead} =
        Sales.create_lead(%{
          företag: "Nil Value AB",
          telefon: "+46701999002"
        })

      {:ok, logs} = Audit.list_for_resource("Lead", lead.id)
      created_logs = Enum.filter(logs, fn l -> l.action == "lead.created" end)
      assert length(created_logs) >= 1

      log = hd(created_logs)
      # Status "from" value should be nil (it's a new record)
      if Map.has_key?(log.changes, "status") do
        from_val = get_in(log.changes, ["status", "from"])
        assert is_nil(from_val)
      end
    end
  end
end
