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
      # Test that the format_value function correctly converts CiString to string.
      # We verify this by creating a lead (which has CreateAuditLog) and checking
      # that all values in the audit log changes are plain types (string, nil),
      # not Ash structs.
      {:ok, lead} =
        Sales.create_lead(%{
          företag: "CiString Lead AB",
          telefon: "+46701999099"
        })

      {:ok, logs} = Audit.list_for_resource("Lead", lead.id)
      created_logs = Enum.filter(logs, fn l -> l.action == "lead.created" end)
      assert length(created_logs) >= 1

      log = hd(created_logs)

      # Verify all values in the changes map are plain types (string, nil, number)
      # and not Ash structs like %Ash.CiString{}
      for {_field, %{"from" => from, "to" => to}} <- log.changes do
        refute is_struct(from), "Expected plain value for 'from', got struct: #{inspect(from)}"
        refute is_struct(to), "Expected plain value for 'to', got struct: #{inspect(to)}"
      end
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

  describe "format_value/1 — direct unit tests" do
    test "returns nil for nil" do
      assert CreateAuditLog.format_value(nil) == nil
    end

    test "converts atom to string" do
      assert CreateAuditLog.format_value(:active) == "active"
    end

    test "converts Ash.CiString to plain string" do
      ci = Ash.CiString.new("Test@Example.COM")
      result = CreateAuditLog.format_value(ci)
      assert is_binary(result)
      refute is_struct(result)
      # CiString stores original casing; to_string preserves it
      assert result == "Test@Example.COM"
    end

    test "passes through plain strings unchanged" do
      assert CreateAuditLog.format_value("hello") == "hello"
    end

    test "passes through integers unchanged" do
      assert CreateAuditLog.format_value(42) == 42
    end
  end
end
