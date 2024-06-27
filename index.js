import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import LocalStrategy from "passport-local";
import GoogleStrategy from "passport-google-oauth2"

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
let loginUser;
let family = []

// Get members of family
async function getUser(){
  family = []
  try {
    let data = await db.query("select * from family_members where family_id = $1",[loginUser?.id]);
    family.push(...data.rows);
  } catch (error) {
    console.log(error);
  }
};

async function checkVisisted(userId) {
  try {
    let countries = [];
    let result;
    result = await db.query("SELECT country_code FROM visited_countries where user_id = $1",[userId]);

    result.rows.forEach((country) => {
      countries.push(country.country_code);
    });
    return countries;
  } catch (error) {
    console.log(error);
  }
};

app.get("/", async (req,res) => {
  res.render("signIn.ejs");
});

app.get("/signUp",(req,res) => {
  res.render("signUp.ejs");
});

app.get("/signIn",(req,res) => {
  res.render("signIn.ejs");
});

app.get("/home", async (req, res) => {
  getUser();
  const dataUser = await db.query("select * from family_members where id = $1",[currentUserId]);
  const user = dataUser.rows[0];
  console.log(user);
  const countries = await checkVisisted(currentUserId);

  res.render("index.ejs", {
    countries: countries,
    total: countries?.length,
    users: family,
    color: user?.color,
  });
});

app.get("/auth/google",passport.authenticate("google",{
    scope: ["profile","email"],
  })
);

app.get("/auth/google/tracker",passport.authenticate("google", {
  successRedirect: "/home",
  failureRedirect: "/login",
}));

app.get("/logOut", (req,res) =>{
  req.logout(function(err){
    if(err){
      return next(err);
    }
    currentUserId = 0;
    res.redirect("/signIn");
  })
})

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
        loginUser = result.rows[0];
        req.login(loginUser, (err) => {
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

    if(result.rows.length === 0){
      const dataUser = await db.query("select * from family_members where id = $1",[currentUserId]);
      const user = dataUser.rows[0];
      const countries = await checkVisisted(currentUserId);

      res.render("index.ejs", {
        countries: countries,
        total: countries?.length,
        users: family,
        color: user?.color,
        error: "Cannot find the country"
      });
    }

    const data = result.rows[0];
    const countryCode = data.country_code;
    try {
      await db.query(
        "INSERT INTO visited_countries (country_code,user_id,family_id) VALUES ($1,$2,$3)",
        [countryCode,currentUserId,loginUser?.id]
      );
      res.redirect("/home");
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});


app.post("/user", async (req, res) => {
  console.log(req.body);
  if(req.body.add){
    res.render('new.ejs');

  } else if(req.body.user){
    currentUserId = +req.body.user;
    res.redirect("/home");
  }
});

app.post("/new", async (req, res) => {
  console.log(req.body);
  const name = req.body.name || "";
  const color = req.body.color || "";
  const familyID = loginUser?.id;
  const result = 
    await db.query("INSERT INTO family_members (name, color,family_id) VALUES ($1,$2,$3) RETURNING id;",[name,color,familyID]);

  currentUserId = result?.rows[0]?.id;
  res.redirect("/home");
});

passport.use("local", new LocalStrategy(async function verify(username, password, cb){
    console.log(username + " ___ " + password)
    try {
      const result = await db.query("select * from users where email = $1",[username]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        loginUser = user;
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

passport.use("google", new GoogleStrategy({
  clientID: process.env['GOOGLE_CLIENT_ID'],
  clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
  callbackURL: process.env.GG_CALLBACK_URL,
  userProfileURL: process.env.USER_PROFILE_URL,
}, async function verify(accessToken, refreshToken, profile,cb){
  try {
    const result = await db.query("select * from users where email = $1", [profile.email]);
    if(result.rows.length === 0){
      const user = await db.query(
        "INSERT INTO users (name,password,email,color) VALUES ($1,$2,$3,$4) returning *",
        [profile.displayName,"google",profile.email,"teal"]
      );
      loginUser = user.rows[0];
      cb(null,loginUser);
    } else{
      loginUser = result.rows[0];
      cb(null,result.rows[0]);
    }
  } catch (error) {
    cb(error);
  }
}))

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
