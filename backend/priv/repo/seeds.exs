alias Saleflow.Accounts
alias Saleflow.Sales

# Create admin
{:ok, admin} =
  Accounts.register(%{
    email: "admin@saleflow.se",
    password: "admin123",
    password_confirmation: "admin123",
    name: "Admin",
    role: :admin
  })

# Create agent
{:ok, agent} =
  Accounts.register(%{
    email: "agent@saleflow.se",
    password: "agent123",
    password_confirmation: "agent123",
    name: "Test Agent",
    role: :agent
  })

# Sample leads
leads = [
  %{företag: "Kroppex AB", telefon: "+46812345678", stad: "Stockholm", bransch: "Hälsa", orgnr: "5591485619"},
  %{företag: "Citymassage", telefon: "+460735305471", stad: "Malmö", bransch: "Massage"},
  %{företag: "Frisör Supreme AB", telefon: "+46701112233", stad: "Göteborg", bransch: "Frisör"},
  %{företag: "Byggmästarna i Norr AB", telefon: "+46702223344", stad: "Umeå", bransch: "Bygg", orgnr: "5595795245"},
  %{företag: "VVS Experten AB", telefon: "+46703334455", stad: "Uppsala", bransch: "VVS"},
]

for params <- leads do
  Sales.create_lead(Map.put(params, :status, :new))
end

IO.puts("Seeded: 1 admin, 1 agent, #{length(leads)} leads")
