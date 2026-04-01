defmodule Saleflow.Sales.ImportCoverageTest do
  @moduledoc """
  Additional coverage tests for Saleflow.Sales.Import.

  Covers:
  - parse_xlsx with empty XLSX (no rows at all)
  - parse_xlsx with numeric cell values (exercises to_string_value/1 for non-binary and nil)
  - import_rows with empty string företag (blank? via get_string_value → nil path)
  - import_rows with nil fields
  """

  use Saleflow.DataCase, async: true

  alias Saleflow.Sales.Import

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "import_rows — edge cases for uncovered branches" do
    test "rows with nil företag are skipped" do
      rows = [
        %{"företag" => nil, "telefon" => "+46701777001"},
        %{"företag" => "Valid AB", "telefon" => "+46701777002"}
      ]

      assert {:ok, %{created: 1, skipped: 1}} = Import.import_rows(rows)
    end

    test "rows with nil telefon are skipped" do
      rows = [
        %{"företag" => "No Phone AB", "telefon" => nil},
        %{"företag" => "Has Phone AB", "telefon" => "+46701777003"}
      ]

      assert {:ok, %{created: 1, skipped: 1}} = Import.import_rows(rows)
    end

    test "rows with empty string företag are skipped (get_string_value returns nil for empty)" do
      rows = [
        %{"företag" => "", "telefon" => "+46701777004"}
      ]

      assert {:ok, %{created: 0, skipped: 1}} = Import.import_rows(rows)
    end

    test "rows with non-string values are handled by to_string in get_string_value" do
      rows = [
        %{"företag" => "Numeric AB", "telefon" => "+46701777005", "anställda" => 42}
      ]

      assert {:ok, %{created: 1, skipped: 0}} = Import.import_rows(rows)
    end
  end

  describe "parse_xlsx — empty XLSX" do
    test "returns empty list for XLSX with no rows" do
      xlsx_path = Path.join([File.cwd!(), "test", "fixtures", "empty.xlsx"])
      assert {:ok, []} = Import.parse_xlsx(xlsx_path)
    end
  end

  describe "parse_xlsx — numeric and nil cell values" do
    test "converts numeric cell values via to_string_value and handles nil cells" do
      xlsx_path = Path.join([File.cwd!(), "test", "fixtures", "numeric_leads.xlsx"])
      assert {:ok, rows} = Import.parse_xlsx(xlsx_path)

      # First row has valid data with numeric anställda (42 → "42")
      first = Enum.at(rows, 0)
      assert first["företag"] == "NumericCo"
      assert first["telefon"] == "+46701234999"
      assert first["anställda"] == "42"

      # Second row has nil företag and telefon (missing cells) and numeric anställda
      second = Enum.at(rows, 1)
      assert is_nil(second["företag"])
      assert is_nil(second["telefon"])
      assert second["anställda"] == "100"
    end
  end

  describe "parse_xlsx — error path" do
    test "returns error for non-existent file" do
      assert {:error, _} = Import.parse_xlsx("/tmp/nonexistent_coverage_test.xlsx")
    end
  end
end
