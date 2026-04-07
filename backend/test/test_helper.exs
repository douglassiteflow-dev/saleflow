ExUnit.start()
Ecto.Adapters.SQL.Sandbox.mode(Saleflow.Repo, :manual)

Mox.defmock(Saleflow.Telavox.MockClient, for: Saleflow.Telavox.ClientBehaviour)
Mox.defmock(Saleflow.Workers.DemoGeneration.MockRunner, for: Saleflow.Workers.DemoGeneration.ClaudeRunner)
Mox.defmock(Saleflow.AssemblyAI.MockClient, for: Saleflow.AssemblyAI.ClientBehaviour)
