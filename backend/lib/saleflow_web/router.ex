defmodule SaleflowWeb.Router do
  use SaleflowWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug CORSPlug, origin: ["http://localhost:5173", "https://sale.siteflow.se"]
  end

  pipeline :browser do
    plug :accepts, ["html"]
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
    post "/auth/forgot-password", AuthController, :forgot_password
    post "/auth/reset-password", AuthController, :reset_password
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

    get "/my-stats", AdminController, :my_stats

    get "/requests", RequestController, :index
    post "/requests", RequestController, :create
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

    # Requests
    put "/requests/:id", RequestController, :update

    # Lead Lists
    get "/lists", ListController, :index
    post "/lists", ListController, :create
    get "/lists/:id", ListController, :show
    put "/lists/:id", ListController, :update
    get "/lists/:id/leads", ListController, :leads
    post "/lists/:id/agents", ListController, :assign_agent
    delete "/lists/:id/agents/:user_id", ListController, :remove_agent
    get "/lists/:id/agents", ListController, :list_agents
  end

  # SPA fallback — serve index.html for all non-API routes
  scope "/", SaleflowWeb do
    pipe_through :browser
    get "/*path", SPAController, :index
  end
end
