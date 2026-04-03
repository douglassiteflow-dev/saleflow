r = Saleflow.Repo.query!("SELECT name, telavox_token IS NOT NULL as has_token FROM users")
Enum.each(r.rows, fn [name, has] -> IO.puts("#{name}: has_token=#{has}") end)
