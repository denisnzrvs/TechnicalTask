let accessTokenMsg = document.getElementById("accessTokenStatusMsg");
accessTokenMsg.innerText = "Acquiring access token";

let accessTokenGlobal;
let readings = [];

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

    let storageExpDate = storageItem.expiry + 10800000; //account for the time difference of 3 hours between client and server
    if (new Date().getTime() > storageExpDate - 60000) { //checks if the token is about to expire in 1 minute
        getAccessToken();
        console.log("Access token expired, requesting new token");
    }

    //TO DO: if new token requested, do not load token from localStorage

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
    req.setRequestHeader("Authorization", "Basic "); //token removed for security reasons
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

async function startDataCollection() {

    const response = await fetch("http://10.101.0.1:10101/task", {
        method: "POST",
        headers: {
            'Authorization': `Bearer ${accessTokenGlobal}`,
            'Content-Type': 'text/plain; charset=UTF-8'
        },
        body: "command=begin"
    });

    if (response.ok) {
        console.log("Server responded with 200 OK");
        getReading()
    } else {
        console.log("Failed to start data collection:", response);
    }
}

async function stopDataCollection() {

    const response = await fetch("http://10.101.0.1:10101/task", {
        method: "POST",
        headers: {
            'Authorization': `Bearer ${accessTokenGlobal}`,
            'Content-Type': 'text/plain; charset=UTF-8'
        },
        body: "command=end"
    });

    if (response.ok) {
        console.log("Server responded with 200 OK. Data collection stopped.");
    } else {
        console.log("Failed to stop data collection:", response);
    }
}

async function getReading() {

    while (readings.length < 100) {
        try {
            var currentTimeUTC = new Date().toLocaleTimeString('lv-LV', { timeZone: 'UTC' }).trim();

            console.log(currentTimeUTC);
            const response = await fetch('http://10.101.0.1:10101/task', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessTokenGlobal}`,
                    'Content-Type': 'text/plain; charset=UTF-8'
                },
                body: `command=getvalue,request=${currentTimeUTC}`
            });

            var machineData = await response.json();
            var data = machineData.data;


            console.log(data);
            if (data.type == 'unknown' || data.temp < 3 || data.temp >= 200) {
                continue;
            }
            data.time = currentTimeUTC;
            readings.push(data);
        } catch (error) {
            console.error("Error fetching data:", error);
        }
    }

    stopDataCollection();
    console.log(readings.length);
    console.log(readings);
    exportData();

}

function exportData() {

    let csv = 'Time,Node,Type,Temperature °C,Δ\n';
    let delta, celsius;


    for (let i = 0; i < readings.length; i++) {
        let reading = readings[i];
        let matchFound = false;
        celsius = ((reading.temp - 32) * 5 / 9).toFixed(2);

        //find delta

        let index = readings.indexOf(reading); //index of currently observed reading

        if (index === 0) {
            delta = '';
            csv += `${reading.time},${reading.node},${reading.type},${celsius},${delta}\n`;
            continue;
        } //skip first reading

        while (index > 0 && !matchFound) {
            let prevReading = readings[index - 1];
            if (reading.node == prevReading.node && reading.type == prevReading.type) {
                delta = (reading.temp - prevReading.temp).toFixed(2);
                csv += `${reading.time},${reading.node},${reading.type},${celsius},${delta}\n`;
                matchFound = true;
            } else {
                index--;
            }
        }

        if (!matchFound) {
            delta = '';
            csv += `${reading.time},${reading.node},${reading.type},${celsius},${delta}\n`;
        }
    }
    console.log(csv);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8,' })
    const objUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', objUrl)
    link.setAttribute('download', 'File.csv')
    link.textContent = 'Download CSV'
    document.querySelector('body').append(link)


}
