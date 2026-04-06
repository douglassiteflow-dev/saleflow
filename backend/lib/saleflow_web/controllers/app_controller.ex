defmodule SaleflowWeb.AppController do
  use SaleflowWeb, :controller

  # ---------------------------------------------------------------------------
  # Agent endpoint
  # ---------------------------------------------------------------------------

  @doc """
  Agent: returns active apps the current user has permission for.
  Admin: returns all active apps.
  """
  def my_apps(conn, _params) do
    user = conn.assigns.current_user

    {:ok, active_apps} =
      Saleflow.Apps.App
      |> Ash.Query.for_read(:list_active)
      |> Ash.read()

    apps =
      if user.role == :admin do
        active_apps
      else
        {:ok, permissions} =
          Saleflow.Apps.AppPermission
          |> Ash.Query.for_read(:for_user, %{user_id: user.id})
          |> Ash.read()

        allowed_ids = MapSet.new(permissions, & &1.app_id)
        Enum.filter(active_apps, &MapSet.member?(allowed_ids, &1.id))
      end

    json(conn, %{apps: Enum.map(apps, &serialize_app/1)})
  end

  # ---------------------------------------------------------------------------
  # Admin endpoints
  # ---------------------------------------------------------------------------

  @doc """
  Admin: lists all apps with agent_count per app.
  """
  def index(conn, _params) do
    {:ok, apps} =
      Saleflow.Apps.App
      |> Ash.Query.for_read(:list_all)
      |> Ash.read()

    apps_with_count =
      Enum.map(apps, fn app ->
        {:ok, permissions} =
          Saleflow.Apps.AppPermission
          |> Ash.Query.for_read(:for_app, %{app_id: app.id})
          |> Ash.read()

        serialize_app(app) |> Map.put(:agent_count, length(permissions))
      end)

    json(conn, %{apps: apps_with_count})
  end

  @doc """
  Admin: gets app by slug with list of agents and their access status.
  """
  def show(conn, %{"slug" => slug}) do
    case Saleflow.Apps.App
         |> Ash.Query.for_read(:by_slug, %{slug: slug})
         |> Ash.read_one() do
      {:ok, nil} ->
        conn |> put_status(:not_found) |> json(%{error: "App not found"})

      {:ok, app} ->
        {:ok, permissions} =
          Saleflow.Apps.AppPermission
          |> Ash.Query.for_read(:for_app, %{app_id: app.id})
          |> Ash.read()

        permission_user_ids = MapSet.new(permissions, & &1.user_id)

        {:ok, users} = Saleflow.Accounts.list_users()

        agents =
          Enum.map(users, fn user ->
            %{
              id: user.id,
              email: to_string(user.email),
              name: user.name,
              role: to_string(user.role),
              has_access: MapSet.member?(permission_user_ids, user.id)
            }
          end)

        json(conn, %{app: serialize_app(app), agents: agents})
    end
  end

  @doc """
  Admin: toggles app.active boolean.
  """
  def toggle(conn, %{"slug" => slug}) do
    case Saleflow.Apps.App
         |> Ash.Query.for_read(:by_slug, %{slug: slug})
         |> Ash.read_one() do
      {:ok, nil} ->
        conn |> put_status(:not_found) |> json(%{error: "App not found"})

      {:ok, app} ->
        {:ok, updated} =
          app
          |> Ash.Changeset.for_update(:toggle, %{active: !app.active})
          |> Ash.update()

        Saleflow.Audit.create_log(%{
          user_id: conn.assigns.current_user.id,
          action: "admin.app_toggled",
          resource_type: "App",
          resource_id: updated.id,
          changes: %{active: updated.active}
        })

        json(conn, %{app: serialize_app(updated)})
    end
  end

  @doc """
  Admin: grants agent access to an app.
  """
  def add_permission(conn, %{"slug" => slug, "user_id" => user_id}) do
    case Saleflow.Apps.App
         |> Ash.Query.for_read(:by_slug, %{slug: slug})
         |> Ash.read_one() do
      {:ok, nil} ->
        conn |> put_status(:not_found) |> json(%{error: "App not found"})

      {:ok, app} ->
        case Saleflow.Apps.AppPermission
             |> Ash.Changeset.for_create(:create, %{app_id: app.id, user_id: user_id})
             |> Ash.create() do
          {:ok, _permission} ->
            Saleflow.Audit.create_log(%{
              user_id: conn.assigns.current_user.id,
              action: "admin.app_permission_granted",
              resource_type: "App",
              resource_id: app.id,
              metadata: %{target_user_id: user_id}
            })

            conn |> put_status(:created) |> json(%{ok: true})

          {:error, _} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to add permission"})
        end
    end
  end

  @doc """
  Admin: revokes agent access to an app.
  """
  def remove_permission(conn, %{"slug" => slug, "user_id" => user_id}) do
    case Saleflow.Apps.App
         |> Ash.Query.for_read(:by_slug, %{slug: slug})
         |> Ash.read_one() do
      {:ok, nil} ->
        conn |> put_status(:not_found) |> json(%{error: "App not found"})

      {:ok, app} ->
        {:ok, permissions} =
          Saleflow.Apps.AppPermission
          |> Ash.Query.for_read(:for_app_and_user, %{app_id: app.id, user_id: user_id})
          |> Ash.read()

        Enum.each(permissions, &Ash.destroy!/1)

        Saleflow.Audit.create_log(%{
          user_id: conn.assigns.current_user.id,
          action: "admin.app_permission_revoked",
          resource_type: "App",
          resource_id: app.id,
          metadata: %{target_user_id: user_id}
        })

        json(conn, %{ok: true})
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_app(app) do
    %{
      id: app.id,
      slug: app.slug,
      name: app.name,
      description: app.description,
      long_description: app.long_description,
      icon: app.icon,
      active: app.active
    }
  end

end
