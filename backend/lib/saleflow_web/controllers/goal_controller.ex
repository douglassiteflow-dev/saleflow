defmodule SaleflowWeb.GoalController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # GET /api/goals
  # ---------------------------------------------------------------------------

  def index(conn, _params) do
    user = conn.assigns.current_user
    {:ok, goals} = Sales.list_active_goals(user.id)
    json(conn, %{goals: Enum.map(goals, &serialize_goal/1)})
  end

  # ---------------------------------------------------------------------------
  # POST /api/goals
  # ---------------------------------------------------------------------------

  def create(conn, params) do
    user = conn.assigns.current_user
    scope = atom_param(params, "scope")

    if user.role != :admin and scope != :personal do
      conn |> put_status(403) |> json(%{error: "Forbidden"})
    else
      goal_params =
        %{
          scope: scope,
          metric: atom_param(params, "metric"),
          target_value: params["target_value"],
          period: atom_param(params, "period"),
          set_by_id: user.id
        }
        |> put_user_id(params, user)

      case Sales.create_goal(goal_params) do
        {:ok, goal} ->
          conn |> put_status(201) |> json(%{goal: serialize_goal(goal)})

        {:error, error} ->
          conn |> put_status(422) |> json(%{error: inspect(error)})
      end
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/goals/:id
  # ---------------------------------------------------------------------------

  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, goal} <- Ash.get(Saleflow.Sales.Goal, id),
         :ok <- authorize_modify(goal, user) do
      case Sales.update_goal(goal, %{target_value: params["target_value"]}) do
        {:ok, updated} ->
          json(conn, %{goal: serialize_goal(updated)})

        {:error, error} ->
          conn |> put_status(422) |> json(%{error: inspect(error)})
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(403) |> json(%{error: "Forbidden"})

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Not found"})
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/goals/:id
  # ---------------------------------------------------------------------------

  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, goal} <- Ash.get(Saleflow.Sales.Goal, id),
         :ok <- authorize_modify(goal, user) do
      case Sales.deactivate_goal(goal) do
        {:ok, _} ->
          json(conn, %{ok: true})

        {:error, error} ->
          conn |> put_status(422) |> json(%{error: inspect(error)})
      end
    else
      {:error, :forbidden} ->
        conn |> put_status(403) |> json(%{error: "Forbidden"})

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Not found"})
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp authorize_modify(goal, user) do
    if user.role == :admin or goal.set_by_id == user.id do
      :ok
    else
      {:error, :forbidden}
    end
  end

  defp put_user_id(params, conn_params, user) do
    case conn_params["user_id"] do
      nil ->
        Map.put(params, :user_id, user.id)

      uid ->
        if user.role == :admin do
          Map.put(params, :user_id, uid)
        else
          # Non-admins cannot set user_id for other users
          Map.put(params, :user_id, user.id)
        end
    end
  end

  defp atom_param(params, key) do
    case params[key] do
      nil -> nil
      val when is_atom(val) -> val
      val when is_binary(val) ->
        try do
          String.to_existing_atom(val)
        rescue
          ArgumentError -> nil
        end
    end
  end

  defp serialize_goal(goal) do
    %{
      id: goal.id,
      scope: goal.scope,
      metric: goal.metric,
      target_value: goal.target_value,
      user_id: goal.user_id,
      set_by_id: goal.set_by_id,
      active: goal.active,
      period: goal.period,
      inserted_at: goal.inserted_at,
      updated_at: goal.updated_at
    }
  end
end
