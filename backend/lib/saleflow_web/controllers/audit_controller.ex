defmodule SaleflowWeb.AuditController do
  use SaleflowWeb, :controller

  alias Saleflow.Audit
  alias Saleflow.Accounts

  @doc """
  List audit logs with optional action filter.

  Agents see only their own logs (scoped to current_user.id).
  Admins see all logs and may additionally filter by user_id.
  """
  def index(conn, params) do
    user = conn.assigns.current_user

    filters =
      case user.role do
        :admin ->
          %{}
          |> maybe_put(:user_id, params["user_id"])
          |> maybe_put(:action, params["action"])

        _ ->
          %{user_id: user.id}
          |> maybe_put(:action, params["action"])
      end

    {:ok, logs} = Audit.list_logs(filters)

    user_names = build_user_name_map(logs, user)

    json(conn, %{audit_logs: Enum.map(logs, &serialize_audit_log(&1, user_names, user))})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  # Build a map of user_id => name for all user_ids present in the logs.
  # For agents there is only one user (themselves), so we skip a DB call.
  defp build_user_name_map(_logs, %{role: :agent} = user) do
    %{user.id => "Du"}
  end

  defp build_user_name_map(logs, _admin_user) do
    user_ids =
      logs
      |> Enum.map(& &1.user_id)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    case user_ids do
      [] ->
        %{}

      _ ->
        {:ok, users} = Accounts.list_users()

        Enum.into(users, %{}, fn u -> {u.id, u.name} end)
    end
  end

  defp serialize_audit_log(log, user_names, _current_user) do
    %{
      id: log.id,
      user_id: log.user_id,
      user_name: Map.get(user_names, log.user_id),
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      changes: log.changes,
      metadata: log.metadata,
      inserted_at: log.inserted_at
    }
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
