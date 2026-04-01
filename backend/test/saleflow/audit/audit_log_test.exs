defmodule Saleflow.Audit.AuditLogTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Audit

  @resource_id "00000000-0000-0000-0000-000000000001"
  @user_id "00000000-0000-0000-0000-000000000002"
  @other_resource_id "00000000-0000-0000-0000-000000000003"

  @base_params %{
    action: "lead.created",
    resource_type: "Lead",
    resource_id: @resource_id
  }

  describe "create_log/1" do
    test "creates an audit log entry with all required fields" do
      params = %{
        action: "lead.created",
        resource_type: "Lead",
        resource_id: @resource_id,
        changes: %{"status" => %{"from" => nil, "to" => "new"}},
        metadata: %{"ip" => "127.0.0.1"}
      }

      assert {:ok, log} = Audit.create_log(params)
      assert log.action == "lead.created"
      assert log.resource_type == "Lead"
      assert log.resource_id == @resource_id
      assert log.changes == %{"status" => %{"from" => nil, "to" => "new"}}
      assert log.metadata == %{"ip" => "127.0.0.1"}
      assert is_nil(log.user_id)
      refute is_nil(log.id)
      refute is_nil(log.inserted_at)
    end

    test "creates an audit log entry with user_id" do
      params = Map.merge(@base_params, %{user_id: @user_id})

      assert {:ok, log} = Audit.create_log(params)
      assert log.user_id == @user_id
      assert log.action == "lead.created"
    end

    test "defaults changes to empty map when not provided" do
      assert {:ok, log} = Audit.create_log(@base_params)
      assert log.changes == %{}
    end

    test "defaults metadata to empty map when not provided" do
      assert {:ok, log} = Audit.create_log(@base_params)
      assert log.metadata == %{}
    end

    test "fails without action" do
      params = Map.delete(@base_params, :action)
      assert {:error, _error} = Audit.create_log(params)
    end

    test "fails without resource_type" do
      params = Map.delete(@base_params, :resource_type)
      assert {:error, _error} = Audit.create_log(params)
    end

    test "fails without resource_id" do
      params = Map.delete(@base_params, :resource_id)
      assert {:error, _error} = Audit.create_log(params)
    end

    test "allows user_id to be nil (system events)" do
      params = Map.put(@base_params, :user_id, nil)
      assert {:ok, log} = Audit.create_log(params)
      assert is_nil(log.user_id)
    end
  end

  describe "list_for_resource/2" do
    test "returns only logs for the specified resource" do
      # Create logs for target resource
      {:ok, log1} = Audit.create_log(@base_params)
      {:ok, log2} = Audit.create_log(Map.put(@base_params, :action, "lead.status_changed"))

      # Create a log for a different resource — should not appear
      {:ok, _other} =
        Audit.create_log(%{
          action: "meeting.created",
          resource_type: "Meeting",
          resource_id: @other_resource_id
        })

      assert {:ok, logs} = Audit.list_for_resource("Lead", @resource_id)
      ids = Enum.map(logs, & &1.id)

      assert log1.id in ids
      assert log2.id in ids
      assert length(logs) == 2
    end

    test "returns logs sorted by inserted_at descending" do
      {:ok, first} = Audit.create_log(@base_params)
      {:ok, second} = Audit.create_log(Map.put(@base_params, :action, "lead.status_changed"))

      assert {:ok, [latest | _]} = Audit.list_for_resource("Lead", @resource_id)

      # The most recently inserted should be first
      assert latest.id == second.id
      _ = first
    end

    test "returns empty list when no logs exist for resource" do
      assert {:ok, []} = Audit.list_for_resource("Lead", @resource_id)
    end

    test "filters by resource_type as well as resource_id" do
      # Same UUID, different resource_type — should not mix
      {:ok, _lead_log} = Audit.create_log(@base_params)

      {:ok, _meeting_log} =
        Audit.create_log(%{
          action: "meeting.created",
          resource_type: "Meeting",
          resource_id: @resource_id
        })

      assert {:ok, [log]} = Audit.list_for_resource("Lead", @resource_id)
      assert log.resource_type == "Lead"
    end
  end

  describe "list_logs/1" do
    setup do
      {:ok, user_log} =
        Audit.create_log(Map.merge(@base_params, %{user_id: @user_id}))

      {:ok, system_log} =
        Audit.create_log(%{
          action: "call.logged",
          resource_type: "Call",
          resource_id: @other_resource_id
        })

      {:ok, user_log2} =
        Audit.create_log(%{
          action: "meeting.created",
          resource_type: "Meeting",
          resource_id: @other_resource_id,
          user_id: @user_id
        })

      {:ok, %{user_log: user_log, system_log: system_log, user_log2: user_log2}}
    end

    test "returns all logs when no filters applied", %{
      user_log: user_log,
      system_log: system_log,
      user_log2: user_log2
    } do
      assert {:ok, logs} = Audit.list_logs(%{})
      ids = Enum.map(logs, & &1.id)

      assert user_log.id in ids
      assert system_log.id in ids
      assert user_log2.id in ids
      assert length(logs) == 3
    end

    test "filters by user_id", %{user_log: user_log, user_log2: user_log2, system_log: system_log} do
      assert {:ok, logs} = Audit.list_logs(%{user_id: @user_id})
      ids = Enum.map(logs, & &1.id)

      assert user_log.id in ids
      assert user_log2.id in ids
      refute system_log.id in ids
      assert length(logs) == 2
    end

    test "filters by action", %{user_log: user_log, system_log: system_log, user_log2: user_log2} do
      assert {:ok, logs} = Audit.list_logs(%{action: "lead.created"})
      ids = Enum.map(logs, & &1.id)

      assert user_log.id in ids
      refute system_log.id in ids
      refute user_log2.id in ids
      assert length(logs) == 1
    end

    test "filters by both user_id and action", %{user_log: user_log, user_log2: user_log2} do
      assert {:ok, logs} = Audit.list_logs(%{user_id: @user_id, action: "meeting.created"})
      ids = Enum.map(logs, & &1.id)

      assert user_log2.id in ids
      refute user_log.id in ids
      assert length(logs) == 1
    end

    test "returns logs sorted by inserted_at descending", %{user_log2: user_log2} do
      assert {:ok, [first | _]} = Audit.list_logs(%{})
      # Most recently inserted is user_log2
      assert first.id == user_log2.id
    end

    test "returns empty list when no logs match filter" do
      assert {:ok, []} = Audit.list_logs(%{action: "nonexistent.action"})
    end
  end
end
