defmodule Saleflow.StorageTest do
  use ExUnit.Case, async: true

  alias Saleflow.Storage

  describe "upload/3" do
    test "returns {:ok, :noop} when storage is disabled" do
      assert {:ok, :noop} = Storage.upload("test/key.mp3", "data", "audio/mpeg")
    end
  end

  describe "presigned_url/1" do
    test "returns fake url when storage is disabled" do
      assert {:ok, url} = Storage.presigned_url("recordings/2026/04/abc.mp3")
      assert url == "http://localhost/fake/recordings/2026/04/abc.mp3"
    end
  end
end
