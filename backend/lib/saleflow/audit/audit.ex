defmodule Saleflow.Audit do
  @moduledoc """
  Audit domain for SaleFlow.

  Manages audit logs for compliance and traceability. Every mutating action
  across all domains is logged here so there is a full, tamper-evident history
  of who did what and when.

  ## Usage

      # Log a system event (no actor)
      {:ok, log} = Saleflow.Audit.create_log(%{
        action: "lead.created",
        resource_type: "Lead",
        resource_id: lead_id,
        changes: %{status: %{from: nil, to: "new"}}
      })

      # Log an action taken by a user
      {:ok, log} = Saleflow.Audit.create_log(%{
        user_id: user.id,
        action: "meeting.created",
        resource_type: "Meeting",
        resource_id: meeting_id,
        changes: %{},
        metadata: %{ip: "1.2.3.4"}
      })

      # Query logs for a specific resource
      {:ok, logs} = Saleflow.Audit.list_for_resource("Lead", lead_id)

      # Query all logs with optional filters
      {:ok, logs} = Saleflow.Audit.list_logs(%{user_id: user.id})
      {:ok, logs} = Saleflow.Audit.list_logs(%{action: "lead.created"})
  """

  use Ash.Domain

  resources do
    resource Saleflow.Audit.AuditLog
  end

  @doc """
  Creates an audit log entry.

  Required params: `:action`, `:resource_type`, `:resource_id`
  Optional params: `:user_id`, `:changes` (default `%{}`), `:metadata` (default `%{}`)
  """
  @spec create_log(map()) :: {:ok, Saleflow.Audit.AuditLog.t()} | {:error, Ash.Error.t()}
  def create_log(params) do
    Saleflow.Audit.AuditLog
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all audit logs for a specific resource, sorted by `inserted_at` descending.
  """
  @spec list_for_resource(String.t(), Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Audit.AuditLog.t())} | {:error, Ash.Error.t()}
  def list_for_resource(resource_type, resource_id) do
    Saleflow.Audit.AuditLog
    |> Ash.Query.for_read(:list_for_resource, %{
      resource_type: resource_type,
      resource_id: resource_id
    })
    |> Ash.read()
  end

  @doc """
  Returns audit logs with optional filters, sorted by `inserted_at` descending.

  Supported filter keys: `:user_id`, `:action`
  Omitted keys are not applied as filters (returns all logs when `filters` is `%{}`).
  """
  @spec list_logs(map()) ::
          {:ok, list(Saleflow.Audit.AuditLog.t())} | {:error, Ash.Error.t()}
  def list_logs(filters \\ %{}) do
    Saleflow.Audit.AuditLog
    |> Ash.Query.for_read(:list_logs, filters)
    |> Ash.read()
  end
end
