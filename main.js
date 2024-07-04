let accessTokenMsg = document.getElementById("accessTokenStatusMsg");
accessTokenMsg.innerText = "Acquiring access token";

let accessTokenGlobal;

checkLocalToken();

//checks if previous token is saved locally, and if it is not expired. If it is expired, requests a new token.
function checkLocalToken() {
    let storageItem = localStorage.getItem("accessToken");

    //request access token if not found in local storage
    if (!storageItem) {
        getAccessToken();
        console.log("Access token not found, requesting new token");
    }
    storageItem = JSON.parse(storageItem);

    let storageExpDate = storageItem.expiry;
    if (new Date().getTime() < storageExpDate - 60000) {
        getAccessToken();
        console.log("Access token expired, requesting new token");
    }

    accessTokenGlobal = storageItem.value;
    console.log("Access token found in local storage: ", accessTokenGlobal, ". It will expire on ", storageExpDate);
    document.getElementById("accessTokenStatusMsg").innerText = "Access token acquired from local storage.";
}

//saves the access token and its expiry date to local storage
function setTokenWithExpiry(accessToken, expiryDate) {
    const item = {
        value: accessToken,
        expiry: new Date(expiryDate).getTime()
    }
    console.log(item.expiry);
    localStorage.setItem("accessToken", JSON.stringify(item));
}

async function getAccessToken() {

    let req = new XMLHttpRequest();
    req.open("GET", "http://10.101.0.1:10101/?token=renew", true);
    req.setRequestHeader("Authorization", "Basic ");
    req.send();

    req.onreadystatechange = function () {
        if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {

            let xmlParser = new DOMParser();
            let xmlDoc = xmlParser.parseFromString(req.responseText, "text/xml");
            console.log(xmlDoc);
            let accessToken = xmlDoc.getElementsByTagName("Value")[0].childNodes[0].nodeValue;
            let accessTokenExpDate = xmlDoc.getElementsByTagName("Expires")[0].childNodes[0].nodeValue;
            //update global value
            accessTokenGlobal = accessToken


            setTokenWithExpiry(accessToken, accessTokenExpDate);
            document.getElementById("accessTokenStatusMsg").innerText = "Access token acquired";
            console.log("Access token: ", accessToken);
            console.log("Expires: ", accessTokenExpDate);
        } else {
            document.getElementById("accessTokenStatusMsg").innerText = "Failed to acquire access token";
        }
    }
}


// try to access token