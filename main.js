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
        return;
    }
    storageItem = JSON.parse(storageItem);

    let storageExpDate = storageItem.expiry + 10800000; //account for the time difference of 3 hours between client and server
    if (new Date().getTime() > storageExpDate - 60000) { //checks if the token is about to expire in 1 minute
        getAccessToken();
        console.log("Access token expired/about to expire, requesting new token");
    } else {
        // if local token is found and is not about to expire, use it.
        accessTokenGlobal = storageItem.value;
        console.log("Access token found in local storage: ", accessTokenGlobal, ". It will expire on ", storageExpDate);
        document.getElementById("accessTokenStatusMsg").innerText = "Access token acquired from local storage.";
    }
}

//saves the access token and its expiry date to local storage
function setTokenWithExpiry(accessToken, expiryDate) {
    const item = {
        value: accessToken,
        expiry: new Date(expiryDate).getTime()
    }
    localStorage.setItem("accessToken", JSON.stringify(item));
}

async function getAccessToken() {

    let req = new XMLHttpRequest();
    req.open("GET", "http://10.101.0.1:10101/?token=renew", true);
    req.setRequestHeader("Authorization", `Basic `); //encoded username:password removed for security reasons
    req.send();

    req.onreadystatechange = function () {
        if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {

            let xmlParser = new DOMParser();
            let xmlDoc = xmlParser.parseFromString(req.responseText, "text/xml");
            console.log(xmlDoc);
            let accessToken = xmlDoc.getElementsByTagName("Value")[0].childNodes[0].nodeValue;
            let accessTokenExpDate = xmlDoc.getElementsByTagName("Expires")[0].childNodes[0].nodeValue;

            accessTokenGlobal = accessToken;

            setTokenWithExpiry(accessToken, accessTokenExpDate);
            document.getElementById("accessTokenStatusMsg").innerText = "Access token acquired from server";
            console.log("Access token: ", accessToken);
            console.log("Expires: ", accessTokenExpDate);
        } else {
            document.getElementById("accessTokenStatusMsg").innerText = "Failed to acquire access token. Check console logs for info.";
        }
    }
}

async function startDataCollection() {

    document.querySelector("#downloadButton")?.remove();
    readings = []; //reset readings to empty every time a new data collection process starts

    checkLocalToken(); //check if local access token is still valid/will expire soon

    const response = await fetch("http://10.101.0.1:10101/task", {
        method: "POST",
        headers: {
            'Authorization': `Bearer ${accessTokenGlobal}`,
            'Content-Type': 'text/plain; charset=UTF-8'
        },
        body: "command=begin"
    });

    if (response.ok) {
        console.log("Server responded with 200 OK. Data collection started.");

        //create loading spinner
        const loader = document.createElement('div');
        loader.className = 'loader';
        document.querySelector('#dataCollection').appendChild(loader);

        getReadings()
    } else {
        console.log("Failed to start data collection:", response);
    }
}

async function stopDataCollection() {

    checkLocalToken(); //check if local access token is still valid/will expire soon

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

async function getReadings() {
    checkLocalToken()

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
    exportData();
}

function exportData() {
    let csv = 'Time,Node,Type,Temperature\u00B0C,\u0394\n';
    let delta, celsius;

    for (let i = 0; i < readings.length; i++) {
        let reading = readings[i];
        let matchFound = false;

        // convert farenheit to celsius
        celsius = Math.round(((reading.temp - 32) * 5 / 9) * 100) / 100;

        if (reading.type === "unknown") {
            continue;
        }

        if (i === 0) { // skip delta for first reading, just add it to csv
            delta = '';
            csv += `${reading.time},${reading.node},${reading.type},${celsius},${delta}\n`;
            continue;
        }

        // find the delta for readings with the same node and type
        for (let j = i - 1; j >= 0; j--) {
            let prevReading = readings[j];
            if (reading.node == prevReading.node && reading.type == prevReading.type) {
                prevReadingCelsius = Math.round(((prevReading.temp - 32) * 5 / 9) * 100) / 100;
                delta = Math.round((celsius - prevReadingCelsius) * 100) / 100;
                matchFound = true;
                break;
            } else {
                delta = '';
            }
        }
        csv += `${reading.time},${reading.node},${reading.type},${celsius},${delta}\n`;
    }


    //create CSV file and download button
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8,' });
    const objUrl = URL.createObjectURL(blob);

    let filename;
    fetchFileName().then((name) => {
        filename = name;
    })

    document.querySelector(".loader").remove();

    const button = document.createElement('button');
    button.textContent = 'Download CSV';
    button.id = 'downloadButton';
    button.addEventListener('click', () => {
        const link = document.createElement('a');
        link.setAttribute('href', objUrl);
        link.setAttribute('download', filename);
        link.click();
    });
    document.querySelector("#dataCollection").appendChild(button);

}

async function fetchFileName() {
    checkLocalToken()

    try {
        const response = await fetch('http://10.101.0.1:10101/csv', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessTokenGlobal}`
            }
        });

        const filesize = response.headers.get('Content-Length');
        console.log("Server csv filesize: " + filesize / 1000 + " Kb")

        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const matches = contentDisposition.match(/filename="(.+?)"/);
            if (matches && matches.length > 1) {
                console.log(matches[1]);
                return matches[1];
            }
        }
        return 'file.csv'; // Default filename if no match
    } catch (error) {
        console.error('Error fetching the filename:', error);
        return 'file.csv'; // Default filename in case of an error
    }
}