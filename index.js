import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";

env.config()

const app = express();
const port = 3000;

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = 1;
let users = []

async function getUser(){
  try {
    let data = await db.query("select * from users");
    users = data.rows;
  } catch (error) {
    console.log(err);
  }
}

async function checkVisisted(userId) {
  const result = await db.query("SELECT country_code FROM visited_countries where user_id = $1",[userId]);
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}
app.get("/", async (req, res) => {
  getUser();
  const dataUser = await db.query("select * from users where id = $1",[currentUserId]);
  const user = dataUser.rows[0];
  const countries = await checkVisisted(currentUserId);

  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: user.color,
  });
});

app.post("/add", async (req, res) => {
  const input = req.body["country"];

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    try {
      await db.query(
        "INSERT INTO visited_countries (country_code,user_id) VALUES ($1,$2)",
        [countryCode,currentUserId]
      );
      res.redirect("/");
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});



app.post("/user", async (req, res) => {
  if(req.body.add){
    res.render('new.ejs');

  } else if(req.body.user){
    currentUserId = +req.body.user;
    res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  console.log(req.body);
  const name = req.body.name || "";
  const color = req.body.color || "";
  const result = await db.query("INSERT INTO users (name, color) VALUES ($1,$2) RETURNING id;",[name,color]);

  currentUserId = result?.rows[0]?.id;
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
