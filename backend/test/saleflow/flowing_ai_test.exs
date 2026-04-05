defmodule Saleflow.FlowingAiTest do
  use ExUnit.Case, async: true

  alias Saleflow.FlowingAi

  describe "base_url/0" do
    test "returns default localhost URL" do
      assert FlowingAi.base_url() == "http://localhost:1337"
    end
  end

  describe "logs_url/1" do
    test "builds correct SSE logs endpoint" do
      assert FlowingAi.logs_url("test-slug") ==
               "http://localhost:1337/api/generate/test-slug/logs"
    end
  end

  describe "status_url/1" do
    test "builds correct status endpoint" do
      assert FlowingAi.status_url("test-slug") ==
               "http://localhost:1337/api/generate/test-slug/status"
    end
  end
end
