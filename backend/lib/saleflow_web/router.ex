defmodule SaleflowWeb.Router do
  use SaleflowWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug CORSPlug, origin: ["http://localhost:5173"]
  end

  pipeline :require_auth do
    plug SaleflowWeb.Plugs.RequireAuth
  end

  pipeline :require_admin do
    plug SaleflowWeb.Plugs.RequireAdmin
  end

  # Public
  scope "/api", SaleflowWeb do
    pipe_through :api

    post "/auth/sign-in", AuthController, :sign_in
  end

  # Authenticated
  scope "/api", SaleflowWeb do
    pipe_through [:api, :require_auth]

    get "/auth/me", AuthController, :me
    post "/auth/sign-out", AuthController, :sign_out

    get "/leads", LeadController, :index
    get "/leads/:id", LeadController, :show
    post "/leads/next", LeadController, :next
    post "/leads/:id/outcome", LeadController, :outcome

    get "/meetings", MeetingController, :index
    post "/meetings", MeetingController, :create
    post "/meetings/:id/cancel", MeetingController, :cancel

    get "/audit", AuditController, :index
  end

  # Admin only
  scope "/api/admin", SaleflowWeb do
    pipe_through [:api, :require_auth, :require_admin]

    get "/users", AdminController, :users
    post "/users", AdminController, :create_user
    get "/stats", AdminController, :stats
    post "/import", ImportController, :create
  end
end
