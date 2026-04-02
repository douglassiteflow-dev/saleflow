defmodule Saleflow.Release do
  @moduledoc """
  Tasks for running Ecto migrations in production releases.

  Usage:
    bin/saleflow eval "Saleflow.Release.migrate()"
    bin/saleflow eval "Saleflow.Release.seed()"
  """

  @app :saleflow

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  def seed do
    load_app()

    Ecto.Migrator.with_repo(Saleflow.Repo, fn _repo ->
      seeds_path = Application.app_dir(@app, "priv/repo/seeds.exs")
      Code.eval_file(seeds_path)
    end)
  end

  defp repos, do: Application.fetch_env!(@app, :ecto_repos)

  defp load_app do
    Application.ensure_all_started(@app)
  end
end
