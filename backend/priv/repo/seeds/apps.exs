alias Saleflow.Apps.App

apps = [
  %{slug: "genflow", name: "Genflow", description: "Generera professionella hemsidor för dina kunder", long_description: "Genflow låter dig skapa snygga, responsiva hemsidor direkt från säljsystemet. Välj bland mallar, anpassa innehåll och publicera med ett klick.", icon: "globe", active: false},
  %{slug: "signflow", name: "Signflow", description: "Skapa offerter och avtal, skicka för signering", long_description: "Signflow hanterar hela offert- och avtalsflödet. Skapa dokument, skicka till kunden för digital signering och följ upp status i realtid.", icon: "file-signature", active: false},
  %{slug: "leadflow", name: "Leadflow", description: "Scrapa och importera leads automatiskt", long_description: "Leadflow hittar potentiella kunder automatiskt genom att scrapa företagsdatabaser. Importera direkt till Saleflow med ett klick.", icon: "search", active: false}
]

Enum.each(apps, fn attrs ->
  case Saleflow.Repo.query("SELECT id FROM apps WHERE slug = $1", [attrs.slug]) do
    {:ok, %{rows: []}} ->
      App |> Ash.Changeset.for_create(:create, attrs) |> Ash.create!()
      IO.puts("Created app: #{attrs.name}")
    _ ->
      IO.puts("App already exists: #{attrs.name}")
  end
end)
