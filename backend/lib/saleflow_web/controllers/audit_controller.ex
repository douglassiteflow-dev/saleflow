defmodule SaleflowWeb.AuditController do
  use SaleflowWeb, :controller

  alias Saleflow.Audit

  @doc """
  List audit logs with optional user_id and action filters.
  """
  def index(conn, params) do
    filters =
      %{}
      |> maybe_put(:user_id, params["user_id"])
      |> maybe_put(:action, params["action"])

    case Audit.list_logs(filters) do
      {:ok, logs} ->
        json(conn, %{audit_logs: Enum.map(logs, &serialize_audit_log/1)})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to list audit logs"})
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_audit_log(log) do
    %{
      id: log.id,
      user_id: log.user_id,
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
