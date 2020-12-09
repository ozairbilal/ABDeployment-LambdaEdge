'use strict';

// Origin Response
const sourceCoookie = 'X-Source';
const sourceMain = 'Your old Source';
const sourceExperiment = 'Experimental Source';
const cookiePath = '/';

// Origin Response handler
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const requestHeaders = request.headers;
    console.log('abtest:', JSON.stringify(request));
    const response = event.Records[0].cf.response;    

    const sourceMainCookie = `${sourceCoookie}=${sourceMain}`;
    const sourceExperimenCookie = `${sourceCoookie}=${sourceExperiment}`;  
    // Look for Source cookie
    // A single cookie header entry may contains multiple cookies, so it looks for a partial match
    if (requestHeaders.cookie) {

        for (let i = 0; i < requestHeaders.cookie.length; i++) {
            // ...ugly but simple enough for now   
            if (requestHeaders.cookie[i].value.indexOf(sourceExperimenCookie) >= 0) {
                console.log('Experiment Source cookie found');
                requestHeaders.cookie[i].value += "; " +sourceExperimenCookie
                console.log(requestHeaders.cookie[i])
                setCookie(response, requestHeaders.cookie[i].value);
                callback(null, response);
                return;
            }
            if (requestHeaders.cookie[i].value.indexOf(sourceMainCookie) >= 0) {
                console.log('Main Source cookie found');
                requestHeaders.cookie[i].value += "; " +sourceMainCookie
            
                 console.log(requestHeaders.cookie[i])
                setCookie(response, requestHeaders.cookie[i].value);
                callback(null, response);
                return;
            }            
        }
    }
    
    // If request contains no Source cookie, do nothing and forward the response as-is
    console.log('No Source cookie found');
    callback(null, response);
}

// Add set-cookie header (including path)
const setCookie = function(response, cookie) {
    const domainName = "sellanycar.com"
    const cookieValue = `${cookie}; Path=${cookiePath}; Domain=${domainName}`;
    console.log(`Setting cookie ${cookieValue}`);
    // response.headers['set-cookie'] = [{ key: "Set-Cookie", value: cookieValue }]
    console.log('abtest-response:', JSON.stringify(response));    
    
    if (response.headers['set-cookie']) {
        response.headers['set-cookie'].push({ key: "Set-Cookie", value: cookieValue });    
    } else {
        response.headers['set-cookie'] = [{ key: "Set-Cookie", value: cookieValue }];
    }
    
}
