defmodule Saleflow.Audit.Changes.CreateAuditLog do
  @moduledoc """
  Reusable Ash Resource Change that creates an audit log entry after a
  successful mutating action.

  ## Options

  - `:action` (required) — audit action string, e.g. `"lead.created"`

  ## Usage

  Add this change to any mutating action that should be audited:

      create :create do
        change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.created"}
      end

      update :update_status do
        change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.status_changed"}
      end

  The change runs in an `after_action` callback so it never blocks or rolls
  back the original action if audit logging fails (it logs a warning instead).

  The actor's `user_id` is extracted from the changeset context when the
  action is called with `actor: user`.
  """

  use Ash.Resource.Change

  @impl true
  def init(opts) do
    if is_binary(opts[:action]) and byte_size(opts[:action]) > 0 do
      {:ok, opts}
    else
      {:error, "CreateAuditLog requires an :action option (non-empty string)"}
    end
  end

  @impl true
  def change(changeset, opts, _context) do
    Ash.Changeset.after_action(changeset, fn changeset, result ->
      action_name = opts[:action]
      resource_type = changeset.resource |> Module.split() |> List.last()
      resource_id = result.id

      user_id =
        case changeset.context do
          %{private: %{actor: %{id: id}}} -> id
          _ -> nil
        end

      changed_attrs = extract_changes(changeset)

      params = %{
        user_id: user_id,
        action: action_name,
        resource_type: resource_type,
        resource_id: resource_id,
        changes: changed_attrs,
        metadata: %{}
      }

      case Saleflow.Audit.create_log(params) do
        {:ok, _log} ->
          :ok

        {:error, reason} ->
          require Logger
          Logger.warning("Failed to create audit log for #{action_name}: #{inspect(reason)}")
      end

      {:ok, result}
    end)
  end

  # Extracts changed attribute values from the changeset as a map of
  # %{field_name => %{"from" => old_value, "to" => new_value}}.
  defp extract_changes(%Ash.Changeset{} = changeset) do
    changeset.attributes
    |> Enum.reduce(%{}, fn {field, new_value}, acc ->
      old_value = Map.get(changeset.data, field)

      if old_value != new_value do
        Map.put(acc, to_string(field), %{"from" => format_value(old_value), "to" => format_value(new_value)})
      else
        acc
      end
    end)
  end

  defp format_value(nil), do: nil
  defp format_value(%Ash.CiString{} = v), do: to_string(v)
  defp format_value(v) when is_atom(v), do: to_string(v)
  defp format_value(v), do: v
end
