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

  pipeline :require_gen_key do
    plug SaleflowWeb.Plugs.RequireGenKey
  end

  # Public questionnaire endpoints (no auth required)
  scope "/api/q", SaleflowWeb do
    pipe_through :api

    get "/:token", QuestionnairePublicController, :show
    patch "/:token", QuestionnairePublicController, :save
    post "/:token/complete", QuestionnairePublicController, :complete
    post "/:token/upload", QuestionnairePublicController, :upload
  end

  # Public contract endpoints (no auth required)
  scope "/api/contracts", SaleflowWeb do
    pipe_through :api

    get "/:token", ContractPublicController, :show
    post "/:token/verify", ContractPublicController, :verify
    post "/:token/sign", ContractPublicController, :sign
    get "/:token/pdf", ContractPublicController, :pdf
    patch "/:token", ContractPublicController, :track
  end

  # Public
  scope "/api", SaleflowWeb do
    pipe_through :api

    post "/auth/sign-in", AuthController, :sign_in
    post "/auth/verify-otp", AuthController, :verify_otp
    post "/auth/forgot-password", AuthController, :forgot_password
    post "/auth/reset-password", AuthController, :reset_password

    # Microsoft OAuth callback (browser redirect, no session auth)
    get "/auth/microsoft/callback", MicrosoftController, :callback

    # Microsoft SSO login (no auth required — this IS the login)
    get "/auth/microsoft/login", MicrosoftController, :login_authorize
  end

  # Authenticated
  scope "/api", SaleflowWeb do
    pipe_through [:api, :require_auth]

    get "/auth/me", AuthController, :me
    post "/auth/sign-out", AuthController, :sign_out
    get "/auth/sessions", SessionController, :index
    post "/auth/sessions/logout-all", SessionController, :logout_all

    # Microsoft Teams integration
    get "/auth/microsoft", MicrosoftController, :authorize
    get "/microsoft/status", MicrosoftController, :status
    post "/microsoft/disconnect", MicrosoftController, :disconnect

    get "/leads", LeadController, :index
    get "/leads/:id", LeadController, :show
    post "/leads/next", LeadController, :next
    patch "/leads/:id", LeadController, :update
    post "/leads/:id/outcome", LeadController, :outcome
    get "/leads/:id/comments", LeadController, :comments
    post "/leads/:id/comments", LeadController, :create_comment
    get "/leads/:lead_id/contacts", LeadController, :list_contacts
    post "/leads/:lead_id/contacts", LeadController, :create_contact

    get "/callbacks", LeadController, :callbacks

    get "/dashboard", DashboardController, :index
    get "/dashboard/leaderboard", DashboardController, :leaderboard

    get "/meetings", MeetingController, :index
    get "/meetings/:id", MeetingController, :show
    post "/meetings", MeetingController, :create
    put "/meetings/:id", MeetingController, :update
    post "/meetings/:id/cancel", MeetingController, :cancel
    post "/meetings/:id/create-teams-meeting", MicrosoftController, :create_teams_meeting

    # Deals
    get "/deals", DealController, :index
    get "/deals/:id", DealController, :show
    post "/deals/:id/advance", DealController, :advance
    patch "/deals/:id", DealController, :update
    post "/deals/:id/send-questionnaire", DealController, :send_questionnaire
    post "/deals/:id/send-contract", DealController, :send_contract

    # Demo Configs
    get "/demo-configs", DemoConfigController, :index
    get "/demo-configs/:id/logs", DemoConfigController, :logs
    get "/demo-configs/:id/preview", DemoConfigController, :preview
    get "/demo-configs/:id", DemoConfigController, :show
    post "/demo-configs/:id/advance", DemoConfigController, :advance
    post "/demo-configs/:id/retry", DemoConfigController, :retry

    get "/audit", AuditController, :index

    get "/my-stats", AdminController, :my_stats

    get "/requests", RequestController, :index
    post "/requests", RequestController, :create

    get "/goals", GoalController, :index
    post "/goals", GoalController, :create
    patch "/goals/:id", GoalController, :update
    delete "/goals/:id", GoalController, :delete

    # Telavox integration
    post "/telavox/connect", TelavoxController, :connect
    post "/telavox/disconnect", TelavoxController, :disconnect
    get "/telavox/status", TelavoxController, :status

    # Calls
    post "/calls/dial", CallController, :dial
    post "/calls/hangup", CallController, :hangup
    get "/calls/search", CallSearchController, :search
    get "/calls/history", CallController, :history
    get "/calls/daily-summary", CallController, :daily_summary
    get "/calls/daily-report", CallController, :daily_report
    get "/calls/agent-report", CallController, :agent_report
    get "/calls/:id/recording", CallController, :recording

    # Apps
    get "/apps", AppController, :my_apps

    # Notifications
    get "/notifications", NotificationController, :index
    post "/notifications/read-all", NotificationController, :mark_all_read
    post "/notifications/:id/read", NotificationController, :mark_read
  end

  # Admin only
  scope "/api/admin", SaleflowWeb do
    pipe_through [:api, :require_auth, :require_admin]

    get "/users", AdminController, :users
    post "/users", AdminController, :create_user
    patch "/users/:user_id", AdminController, :update_user
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

    # Deal Flowing AI proxy
    post "/deals/:id/scrape", DealController, :scrape
    post "/deals/:id/generate", DealController, :generate
    post "/deals/:id/deploy", DealController, :deploy

    # Apps
    get "/apps", AppController, :index
    get "/apps/:slug", AppController, :show
    post "/apps/:slug/toggle", AppController, :toggle
    post "/apps/:slug/permissions", AppController, :add_permission
    delete "/apps/:slug/permissions/:user_id", AppController, :remove_permission

    # Playbooks
    get "/playbooks", PlaybookController, :index
    get "/playbooks/active", PlaybookController, :active
    post "/playbooks", PlaybookController, :create
    put "/playbooks/:id", PlaybookController, :update
    delete "/playbooks/:id", PlaybookController, :delete
  end

  # GenFlow API (API-key authenticated)
  scope "/api/gen-jobs", SaleflowWeb do
    pipe_through [:api, :require_gen_key]

    get "/pending", GenJobController, :pending
    post "/:id/pick", GenJobController, :pick
    post "/:id/complete", GenJobController, :complete
    post "/:id/fail", GenJobController, :fail
  end

  # SPA fallback — serve index.html for all non-API routes
  scope "/", SaleflowWeb do
    pipe_through :browser
    get "/*path", SPAController, :index
  end
end
