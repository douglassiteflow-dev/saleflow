defmodule SaleflowWeb.RequestController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Accounts

  @doc """
  Create a new request (bug report or feature request).
  Any authenticated user can submit.
  """
  def create(conn, params) do
    user = conn.assigns.current_user

    request_params = %{
      user_id: user.id,
      type: parse_type(params["type"]),
      description: params["description"]
    }

    case Sales.create_request(request_params) do
      {:ok, request} ->
        conn
        |> put_status(:created)
        |> json(%{request: serialize_request(request, user.name)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create request"})
    end
  end

  @doc """
  List requests.
  Agents see only their own; admins see all, with user_name included.
  """
  def index(conn, _params) do
    user = conn.assigns.current_user

    case user.role do
      :admin ->
        {:ok, requests} = Sales.list_requests()
        {:ok, users} = Accounts.list_users()
        user_map = Map.new(users, fn u -> {u.id, u.name} end)

        json(conn, %{requests: Enum.map(requests, &serialize_request(&1, user_map[&1.user_id]))})

      _ ->
        {:ok, requests} = Sales.list_requests_for_user(user.id)
        json(conn, %{requests: Enum.map(requests, &serialize_request(&1, user.name))})
    end
  end

  @doc """
  Update status and/or admin_notes on a request (admin only).
  """
  def update(conn, %{"id" => id} = params) do
    case Ash.get(Saleflow.Sales.Request, id) do
      {:ok, request} when not is_nil(request) ->
        update_params = %{
          status: parse_status(params["status"]),
          admin_notes: params["admin_notes"]
        }
        |> Enum.reject(fn {_k, v} -> is_nil(v) end)
        |> Map.new()

        case Sales.update_request(request, update_params) do
          {:ok, updated} ->
            Saleflow.Audit.create_log(%{
              user_id: conn.assigns.current_user.id,
              action: "admin.request_updated",
              resource_type: "Request",
              resource_id: updated.id,
              changes: update_params
            })

            user_name = get_user_name(updated.user_id)
            json(conn, %{request: serialize_request(updated, user_name)})

          {:error, _} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "Failed to update request"})
        end

      _ ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "Request not found"})
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_request(request, user_name) do
    %{
      id: request.id,
      user_id: request.user_id,
      user_name: user_name,
      type: request.type,
      description: request.description,
      status: request.status,
      admin_notes: request.admin_notes,
      inserted_at: request.inserted_at,
      updated_at: request.updated_at
    }
  end

  defp get_user_name(user_id) do
    case Ash.get(Saleflow.Accounts.User, user_id) do
      {:ok, user} when not is_nil(user) -> user.name
      _ -> nil
    end
  end

  defp parse_type("bug"), do: :bug
  defp parse_type("feature"), do: :feature
  defp parse_type(_), do: :bug

  defp parse_status("new"), do: :new
  defp parse_status("in_progress"), do: :in_progress
  defp parse_status("done"), do: :done
  defp parse_status("rejected"), do: :rejected
  defp parse_status(nil), do: nil
  defp parse_status(_), do: nil
end
