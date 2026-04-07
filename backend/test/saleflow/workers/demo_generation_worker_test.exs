defmodule Saleflow.Workers.DemoGenerationWorkerTest do
  @moduledoc """
  Tests for DemoGenerationWorker.

  Tests pure functions only (build_brief, output_dir) — does not spawn CLI.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.DemoGenerationWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "demogen#{unique}@test.se",
        name: "Demo Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "DemoTest AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_demo_config!(opts \\ []) do
    lead = Keyword.get_lazy(opts, :lead, fn -> create_lead!() end)
    user = Keyword.get_lazy(opts, :user, fn -> create_user!() end)

    {:ok, dc} =
      Sales.create_demo_config(%{
        lead_id: lead.id,
        user_id: user.id,
        source_url: Keyword.get(opts, :source_url, "https://example.se")
      })

    dc
  end

  # ---------------------------------------------------------------------------
  # Tests for build_brief/2
  # ---------------------------------------------------------------------------

  describe "build_brief/2" do
    test "replaces placeholders in template" do
      dc = create_demo_config!(source_url: "https://testforetag.se")
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      assert brief =~ dc.source_url
      assert brief =~ "/tmp/test-output"
      refute brief =~ "$SOURCE_URL"
      refute brief =~ "$OUTPUT_DIR"
    end

    test "handles nil source_url by replacing with empty string" do
      dc = create_demo_config!(source_url: nil)
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      refute brief =~ "$SOURCE_URL"
      assert brief =~ "/tmp/test-output"
    end

    test "preserves rest of template content" do
      dc = create_demo_config!(source_url: "https://testforetag.se")
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      # The template contains Swedish headings
      assert brief =~ "Demo-hemsida Brief"
      assert brief =~ "index.html"
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for output_dir/1
  # ---------------------------------------------------------------------------

  describe "output_dir/1" do
    test "returns path based on demo config id" do
      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ dc.id
    end

    test "uses default base directory" do
      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ "priv/static/demos"
    end

    test "uses configured base directory when set" do
      original = Application.get_env(:saleflow, :demo_generation_dir)
      Application.put_env(:saleflow, :demo_generation_dir, "/custom/demos")

      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ "/custom/demos"
      assert dir =~ dc.id

      # Restore original config
      if original do
        Application.put_env(:saleflow, :demo_generation_dir, original)
      else
        Application.delete_env(:saleflow, :demo_generation_dir)
      end
    end
  end
end
