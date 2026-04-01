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
    post "/auth/verify-otp", AuthController, :verify_otp
  end

  # Authenticated
  scope "/api", SaleflowWeb do
    pipe_through [:api, :require_auth]

    get "/auth/me", AuthController, :me
    post "/auth/sign-out", AuthController, :sign_out
    get "/auth/sessions", SessionController, :index
    post "/auth/sessions/logout-all", SessionController, :logout_all

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
    get "/users/:user_id/sessions", AdminController, :user_sessions
    post "/users/:user_id/force-logout", AdminController, :force_logout_user
    post "/sessions/:id/force-logout", AdminController, :force_logout_session_action
  end
end
