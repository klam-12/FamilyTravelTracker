import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import LocalStrategy from "passport-local";
import { Strategy } from "passport-local";

const app = express();
const port = 3000;
const saltRound = 10;
env.config()

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    maxAge: 60*60*24*100, 
  }
}))

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

let currentUserId = 1;
let currentUser;
let family = []

// Get members of family
async function getUser(){
  const currentUserId = currentUser?.id;
  family = []
  family.push(currentUser)
  try {
    let data = await db.query("select * from family_members where family_id = $1",[currentUserId]);
    family.push(...data.rows);
  } catch (error) {
    console.log(error);
  }
};

async function checkVisisted(userId) {
  const result = await db.query("SELECT country_code FROM visited_countries where user_id = $1",[userId]);
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
};

app.get("/", async (req,res) => {
  res.render("signIn.ejs");
});

app.get("/signUp",(req,res) => {
  res.render("signUp.ejs");
});

app.get("/signIn",(req,res) => {
  console.log("Get /signIn")
  console.log(req.body);
  res.render("signIn.ejs");
});

// not done
app.get("/home", async (req, res) => {
  getUser();
  const dataUser = await db.query("select * from users where id = $1",[currentUserId]);
  const user = dataUser.rows[0];
  const countries = await checkVisisted(currentUserId);

  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: family,
    color: user.color,
  });
});

app.post("/signUp", async (req,res) => {
  const raw_password = req.body.password;
  const name = req.body.name;
  const email = req.body.email;
  const default_color = "teal";
  console.log(name);

  if (!name || !email || !raw_password) {
    return res.status(400).send('Name, email, and password are required.');
  }

  try {
    bcrypt.hash(raw_password,saltRound, async(err,hash) => {
      if(err){
        console.log("Error hasing password: ", err);
      } else {
        const result = await db.query(
          "INSERT INTO users (name,password,email,color) VALUES ($1,$2,$3,$4) returning *",
          [name,hash,email,default_color]
        );
        currentUser = result.rows[0];
        req.login(currentUser, (err) => {
          if(err){
            console.log(err);
            res.redirect("/signUp")
          } else{
            console.log("success");
            res.redirect("/home");
          }
        });
      }
    })
  } catch (err) {
    console.log(err);
  }
})

app.post("/signIn", 
  passport.authenticate("local",{
    successRedirect: '/home',
    failureRedirect: '/signIn',
  })
);


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
  const result = await db.query("INSERT INTO family_members (name, color) VALUES ($1,$2) RETURNING id;",[name,color]);

  currentUserId = result?.rows[0]?.id;
  res.redirect("/");
});

passport.use("local", new LocalStrategy(async function verify(username, password, cb){
    console.log(username + " ___ " + password)
    try {
      const result = await db.query("select * from users where email = $1",[username]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        currentUser = user;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false, { message: 'Incorrect username or password.' });
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (error) {
      console.log(error);
    }
  }
));

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
