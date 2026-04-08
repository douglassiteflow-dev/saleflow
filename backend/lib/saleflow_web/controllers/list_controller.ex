defmodule SaleflowWeb.ListController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  import SaleflowWeb.ControllerHelpers, only: [maybe_put: 3]
  import SaleflowWeb.Serializers, only: [serialize_lead: 1]

  @doc """
  List all lead lists with stats.
  """
  def index(conn, _params) do
    {:ok, lists} = Sales.list_lead_lists()

    lists_with_stats =
      Enum.map(lists, fn list ->
        {:ok, stats} = Sales.get_lead_list_stats(list.id)
        Map.put(serialize_list(list), :stats, stats)
      end)

    json(conn, %{lists: lists_with_stats})
  end

  @doc """
  Create a new lead list.
  """
  def create(conn, params) do
    case Sales.create_lead_list(%{name: params["name"], description: params["description"]}) do
      {:ok, list} ->
        conn
        |> put_status(:created)
        |> json(%{list: serialize_list(list)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create list"})
    end
  end

  @doc """
  Get a single lead list with stats.
  """
  def show(conn, %{"id" => id}) do
    with {:ok, list} <- Sales.get_lead_list(id),
         {:ok, stats} <- Sales.get_lead_list_stats(id) do
      json(conn, %{list: Map.put(serialize_list(list), :stats, stats)})
    else
      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "List not found"})
    end
  end

  @doc """
  Update a lead list.
  """
  def update(conn, %{"id" => id} = params) do
    with {:ok, list} <- Sales.get_lead_list(id) do
      update_params =
        %{}
        |> maybe_put(:name, params["name"])
        |> maybe_put(:description, params["description"])
        |> maybe_put_status(params["status"])

      case Sales.update_lead_list(list, update_params) do
        {:ok, updated} ->
          json(conn, %{list: serialize_list(updated)})

        {:error, _} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Failed to update list"})
      end
    else
      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "List not found"})
    end
  end

  @doc """
  List leads in a specific list, with optional search.
  """
  def leads(conn, %{"id" => id} = params) do
    search = params["q"]

    case Sales.list_leads_in_list(id, search) do
      {:ok, leads} ->
        json(conn, %{leads: Enum.map(leads, &serialize_lead/1)})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "List not found"})
    end
  end

  @doc """
  Assign an agent to a lead list.
  """
  def assign_agent(conn, %{"id" => list_id, "user_id" => user_id}) do
    case Sales.assign_agent_to_list(list_id, user_id) do
      {:ok, assignment} ->
        conn
        |> put_status(:created)
        |> json(%{assignment: %{id: assignment.id, lead_list_id: assignment.lead_list_id, user_id: assignment.user_id}})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to assign agent"})
    end
  end

  def assign_agent(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "user_id is required"})
  end

  @doc """
  Remove an agent from a lead list.
  """
  def remove_agent(conn, %{"id" => list_id, "user_id" => user_id}) do
    case Sales.remove_agent_from_list(list_id, user_id) do
      :ok ->
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Assignment not found"})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to remove agent"})
    end
  end

  @doc """
  List agents assigned to a lead list.
  """
  def list_agents(conn, %{"id" => list_id}) do
    {:ok, assignments} = Sales.list_agents_for_list(list_id)

    agents =
      Enum.map(assignments, fn assignment ->
        case Ash.get(Saleflow.Accounts.User, assignment.user_id) do
          {:ok, user} ->
            %{
              id: user.id,
              email: to_string(user.email),
              name: user.name,
              role: user.role
            }

          _ ->
            %{id: assignment.user_id, email: nil, name: "Unknown", role: nil}
        end
      end)

    json(conn, %{agents: agents})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_list(list) do
    %{
      id: list.id,
      name: list.name,
      description: list.description,
      imported_at: list.imported_at,
      total_count: list.total_count,
      status: list.status,
      inserted_at: list.inserted_at,
      updated_at: list.updated_at
    }
  end

  defp maybe_put_status(map, nil), do: map
  defp maybe_put_status(map, "active"), do: Map.put(map, :status, :active)
  defp maybe_put_status(map, "paused"), do: Map.put(map, :status, :paused)
  defp maybe_put_status(map, "completed"), do: Map.put(map, :status, :completed)
  defp maybe_put_status(map, _), do: map
end
