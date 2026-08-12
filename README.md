Requirements:

Node.js
Express
Express-session
Axios
Cors
Dotenv
Sql.js

EVE Developer Portal Application (Client ID, Secret Key)
Set Dev Portal link to: http://localhost:5000/auth/callback


Install Node: https://nodejs.org/en

Create Folder Environment

Parent Folder:

    eve-ratting-tracker
 
        main.js
  
        package.js
  
        .env
  
        public (folder)
    
            index.html

<img width="674" height="209" alt="image" src="https://github.com/user-attachments/assets/0eecf252-ba6d-4c85-825f-90926b6818fc" />
<img width="609" height="261" alt="image" src="https://github.com/user-attachments/assets/28764214-4273-4f50-ad2b-4114febff551" />






Once folder is setup, open powershell as ADMINISTRATOR and go to the directory you've created.

npm install express express-session axios cors dotenv sql.js

npm electron install

Once done, open main.js and find:

// Hardcoded EVE Developer Credentials & Environment Variables
const CLIENT_ID = ;
const CLIENT_SECRET = ;
const REDIRECT_URI = 'http://localhost:5000/auth/callback';;
const PORT = 5000;

<img width="530" height="122" alt="image" src="https://github.com/user-attachments/assets/ab387fe5-91d1-4648-ab14-11707e204c1e" />


Enter your client ID and secret into main.js and the .env file (it may need to use both).


Once thats setup, in powershell within the directory: npm start <- test to see if it runs.

If it runs and you're able to auth your characters, you can compile into a .exe with:

npm run build

This will create a /dist/ folder under the parent which will contain the .exe. You can then use this .exe to open the application from now on.
