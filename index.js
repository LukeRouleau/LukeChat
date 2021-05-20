const express = require('express');
const exphbs = require('express-handlebars'); // renders the html pages on serverside, so we won't need another framework
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const crypto = require('crypto');
require('dotenv').config();

// Global stores:
const authTokens = {};
const nickNames = {};
var clients = [];


const getHashedPass = (password) => {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}

const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
}

const determineAuth= (inputPass) => {
    const hashedInput = getHashedPass(String(inputPass));
    const hashedPass = getHashedPass(String(process.env.LUKE_CHAT_PASS));
    return String(hashedInput) == String(hashedPass);
}

// Random Dark Text Color generation for the fonts:

const getRandomColor = () => {
    const h = Math.floor(Math.random() * 360),
          s = Math.floor(Math.random() * 100) + '%',
          l = Math.floor(Math.random() * 50) + '%';// max value of l is 100, but I set to 60 cause I want to generate dark colors
                                                   // (use for background with white/light font color)
    return `hsl(${h},${s},${l})`;
};

/* Configure the Middleware */

// To support URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// To parse cookies from HTTP request
app.use(cookieParser());

app.use((req, res, next) => {
    //Get auth token from the cookies
    const authToken = req.cookies['AuthToken'];
    const nnCookie = req.cookies['NN'];

    // Inject the user to the request
    req.password = authTokens[authToken];
    req.nickName = nickNames[nnCookie];

    next();
});

app.engine('hbs', exphbs({
    extname: '.hbs'
}));

app.set('view engine', 'hbs');


/* Request Handlers */

app.get('/', (req, res) => {
  //res.send('<h1>Hello world</h1>');
    res.render('login');
});

app.get('/nickname', (req, res) => {
    
    console.log("req.password =   " + String(req.password));
    console.log("AuthToken =   " + String(req.cookies['AuthToken']));
    if(req.password) {
        res.render('nickname');
    }
    else{
        res.redirect('./');
    }
});

app.get('/livechat', (req, res) => {
    if(req.password && req.nickName) {
        console.log("Let into chat");
        console.log("req.password = " + req.password);
        console.log("req.nickname = " + req.nickName);
        res.render('chat');
    }
    else{
        console.log("Don't let into the chat");
        res.redirect('./nickname');
    }
})

app.get('/verify', (req,res) => {
    //console.log("GET /verify called");
    if (req.cookies['AuthToken'] in authTokens) {
        res.send('1');
    }
    else { res.send('0'); }
});

app.get('/clientInfo', (req,res) => {
    var data = { 
        authToken: req.cookies['AuthToken'], 
        nickname: req.cookies['NN'], 
        color: getRandomColor()
    };
    res.send(data);
});

app.get('/online', (req, res) => {
    var online = clients.length;
    res.send(String(online));
});

app.post('/login', (req,res) => {
    const { password } = req.body;
    /*
    const hashedPass = getHashedPass(String(password));
    const approved = () => {
        return hashedPass === getHashedPass(String(process.env.LUKE_CHAT_PASS))
    }
    console.log(password);
    console.log(hashedPass);
    console.log(process.env.LUKE_CHAT_PASS);
    console.log(getHashedPass(String(process.env.LUKE_CHAT_PASS)));
    */
   console.log("Password entered:  " + password);
   const approved = determineAuth(password);
   console.log("Approved:  " + approved);
   
   if(approved) {
       const authToken = generateAuthToken();
       authTokens[authToken] = approved; // store a boolean in the object for if approved
       res.cookie('AuthToken', authToken); //store auth token in cookies
       //console.log("I'm getting here");
       res.render('nickname');
    }
    else {
        const authToken = '0';
        res.cookie('AuthToken', authToken);
        res.render('login');
    } 
});

app.post('/nickname', (req, res) => {
    const { nickname } = req.body;
    if(String(nickname).length != 0){
        nickNames[nickname] = true;    // store in the dictionary that this NN is valid
    }
    res.cookie('NN', nickname);
    //console.log("Got here");
    //res.redirect('./livechat');
    res.render('nickname');
});

/* How to note the connection/disconnection from the server
io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
  });
*/



// Display the typed message into the terminal [not broadcast yet to the page]
io.on('connection', (socket) => {
    socket.on('chat message', (msg) => {
      //console.log('message: ' + msg); This just prints to the terminal, we want to broadcast it.
      console.log("socket.id : " + socket.id);

      // fetch the poster name and color using the socket.id
      var name;
      var color;
      for( var i=0, len=clients.length; i<len; ++i ){
        var c = clients[i];
        if(c.clientId == socket.id){
            name = c.nn;
            color = c.userColor;
            break;
        }
      }
      
      var postPacket = {
          message: msg,
          posterName: name,
          color: color
      };

      io.emit('chat message', postPacket); // the event name is 'chat message' and the param we pass it is msg
    });

    
    socket.on('storeClientInfo', (data) => {
      var clientInfo = new Object();
      clientInfo.authToken = data.authToken;
      clientInfo.nn = data.nn;
      clientInfo.userColor = data.color;
      clientInfo.clientId = socket.id;
      clients.push(clientInfo);

      // print the users
      for( var i=0, len=clients.length; i<len; ++i ){
        var c = clients[i];

        console.log("authTok ; " + c.authToken);
        console.log("nickname : " + c.nn);
        console.log("clientId : " + c.clientId);
      }
    });
    
    
   
    socket.on('disconnect', (data) => {
        console.log('user disconnected');
        //console.log("cookies: " + data);

        for( var i=0, len=clients.length; i<len; ++i ){
            var c = clients[i];

            if(c.clientId == socket.id){
                clients.splice(i,1);
                break;
            }
        }
    });
    
});

const PORT = process.env.PORT || 3000;  // When we have it hosted on Heroku, use the environment variable; otherwise, just use port 5000 
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});