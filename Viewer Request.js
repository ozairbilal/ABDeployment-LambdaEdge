'use strict';

// Viewer Request
const sourceCoookie = 'X-Source';
const sourceMain = 'Your Main Source';
const sourceExperiment = 'Experimental  Source';
const experimentTraffic = 0.05;

// Viewer request handler
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    //Prerender Headers
    const user_agent = headers['user-agent'];
    const host = headers['host'];
    
    // Look for source cookie
    if ( headers.cookie ) {
        for (let i = 0; i < headers.cookie.length; i++) {        
            if (headers.cookie[i].value.indexOf(sourceCoookie) >= 0) {
                console.log('Source cookie found. Forwarding request as-is');
                // Forward request as-is
                console.log(`output cookies in loop, ${headers.cookie}`);
                callback(null, request);
                return;
            }         
        }       
    }

    console.log('Source cookie has not been found. Throwing dice...');
    const source = ( Math.random() < experimentTraffic ) ? sourceExperiment : sourceMain;
    console.log(`Source: ${source}`)
    // Add Source cookie
    const cookie = `${sourceCoookie}=${source}`
    console.log(`Adding cookie header: ${cookie}`);
    headers.cookie = headers.cookie || [];
    if (!headers.cookie.length) {
        headers.cookie.push({ key:'Cookie', value: cookie });
    } else {
    headers.cookie[0].value += '; ' + cookie;    
    }
    
     console.log(`output cookies in else, ${headers.cookie[0].value}`);
    // Forwarding request
    callback(null, request);
};
