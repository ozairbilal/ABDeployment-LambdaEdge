A/B testing on AWS CloudFront with Lambda@Edge
==============================================


The Use Case
============

Imagine you have a static website or a Single Page Application served through the CDN. You want to experiment two versions with actual users. I’m focusing on SPA and static contents, as any non-cacheable, back-end generated content (e.g. non-cacheable Rest API requests) would not use the CDN regardless.

A/B testing doesn’t necessarily mean you have two equivalent versions taking 50% of the traffic each. I prefer calling the two versions “_Main_” and “_Experiment_”, rather than “_A_” and “_B_”, to make it clear we have a default and a secondary version. We’ll see why this is important.  
Also, we are testing two complete versions of contents (our entire website or SPA). This is a more realistic use case rather than switching a single element, like a logo image.

A/B testing example (by Maxime Lorant from Wikipedia)

The fraction of traffic going to Experiment is just a parameter of the problem and the logic may be easily extended to multiple experiment versions… but let’s keep it simple.

Server-side vs Client-side A/B testing
--------------------------------------

In general, there are two approaches to A/B testing, client-side and server-side, depending on where you put the intelligence to switch traffic between the two versions.

I’m focusing on **server-side A/B testing**. This may be the only option when, for example, pages are served by an S3 Bucket with no brain. But is also a good choice if you don’t want to “pollute” neither your front-end nor your back-end with additional logic.

The Scenario
------------

Let’s recap our scenario:

*   Front-end A/B testing: static content, SPA or any cacheable content in general.
*   Content is served through CloudFront CDN and we don’t want to lose benefits of the CDN: caching and geographical proximity.
*   We cannot (or do not want to) pollute our front-end with any switching logic. So the logic must be on the CDN not to lose it.  
    **Lambda@Edge is the way of putting logic on the CDN**.
*   For simplicity, I’m serving content from S3 buckets directly. But the idea may be extended to any http/https source.
*   We have two complete versions of front-end: _Main_ and _Experiment_. They are served from two separate S3 buckets (separate CloudFront Distribution Origins).
*   We want to randomly switch a fraction of users to _Experiment_.
*   **We want a user to stay on the same version for the duration of the session** (the browser “session”, remember we don’t have any login).

The last requirement is very important. We don’t want the user jumping from one version to another at every click, or worse, receiving parts of the same page from different versions.  
There are a couple of examples of A/B Testing using in Lambda@Edge, in [CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-a-b-testing) and in the [AWS blog](https://aws.amazon.com/blogs/networking-and-content-delivery/dynamically-route-viewer-requests-to-any-origin-using-lambdaedge/). Both examples use a cookie to keep the user on a version, but both require an external logic to set the cookie. We said we don’t want to modify either front-end or back-end code.  
So, these examples are not enough for us and **the CDN must take care of setting the cookie**.

How it works
============

Here is the working solution, using 3 functions.  
We use a cookie, `X-Source,` to keep the user on a single version for the duration of the browser session. But the client might not have it when it lands on the website…

Stable A/B testing with Lambda@Edge

1.  The browser request is directed to the closest AWS Edge Location. The request **may** contain the `X-Source` cookie.
2.  The **_Viewer Request_** Lambda@Edge function gets triggered on every request. If the cookie is not in the request, it rolls dice to decide which version to send the user to and adds the cookie accordingly.
3.  The Distribution decides whether the request is a cache hit. We are forwarding the `X-Source` cookie and the cookie is part of the cache key (see CloudFront settings, below).
4.  If the request is a cache-miss, it triggers the **_Origin Request_** function. This function is triggered only on cache-miss and introduces no overhead on hits. By default, the Distribution forwards cache-misses to the _Main_ Origin. If the cookie points to _Experiment_, the request Origin is modified.
5.  The content is served by either S3 bucket. S3 completely ignores the cookie.
6.  The response from the Origin triggers the **_Origin Request_** function. This happens only on cache misses. It adds a `Set-Cookie` header to set `X-Source`. Remember the cookie might have been added by the Viewer Request function and not by the browser.
7.  The decorated response, including the `Set-Cookie` header, is cached by the Distribution. The cache key is the object URI and the `X-Cookie`.
8.  The response is returned to the browser from the Edge location.
9.  The browser complies with the `Set-Cookie` headers, setting the cookie. The version will be stable for the duration of the session.
10.  In case of a cache hit, the response would have been returned immediately from the Edge Location and it would include the `Set-Cookie` header also cached (7).

Benefits of this approach
-------------------------

This solution allows leveraging CDN caching, keeping both versions of content in the cache.

The additional overhead of the Viewer Request function, executed on every request, is negligible. We are using a single function for all contents, so it is “hot” most of the time, avoiding “cold-start” latency (though Node.js cold-start is fast and Lambda@Edge cold-start is even faster).  
I observed a function execution time <1 ms most of the times, with few outliers of 15..20ms.

We don’t need to make any change to the application.

The default behaviour is serving the content from _Main_. This means that turning the A/B on and off just means attaching and detaching a single function: _Viewer Request._ The switching is (almost) atomic for a user, (usually) hitting the same Edge Location all the times, regardless the distributed and **very eventually consistent** nature of the CDN.

CloudFront Distribution settings
================================

The CloudFront Distribution has **two Origins**, pointing the _Main_ and _Experiment_ sources. Both S3 bucket in our example and both with access restricted by Origin Access Identity.

<img alt="Image for post" class="t u v hw aj" src="https://miro.medium.com/max/4068/1\*pzZ7g-1KeYAaklg00bE0LA.png" width="2034" height="582" srcSet="https://miro.medium.com/max/552/1\*pzZ7g-1KeYAaklg00bE0LA.png 276w, https://miro.medium.com/max/1104/1\*pzZ7g-1KeYAaklg00bE0LA.png 552w, https://miro.medium.com/max/1280/1\*pzZ7g-1KeYAaklg00bE0LA.png 640w, https://miro.medium.com/max/1400/1\*pzZ7g-1KeYAaklg00bE0LA.png 700w" sizes="700px"/>

CloudFront Distribution, Origins

The `Default(*)` **Behaviour** points the _Main_ Origin.  
It must Forward the `X-Source` cookie, as a whitelist. This cookie becomes part of the cache key. You don’t need a Behaviour for the _Experiment_ Origin, as the Origin is switched dynamically by a function.


CloudFront Distribution, Default Behaviour settings

Lambda functions
================

I’m using Node.js for functions.

Viewer Request
--------------

This function intercepts every client request, before deciding whether it is a cache hit.

The function looks for the `X-Source` cookie. If missing, it rolls dice to decide the version to serve and adds the cookie to the request.

Origin Request
--------------

This function intercepts requests on cache misses only.

If `X-Source` is present and points to _Experiment_, the Origin is changed. Otherwise it remains untouched, pointing to _Main_, as by Behaviour settings.

The `Host` header must be changed accordingly, or the execution would fail, complaining about “_The request signature we calculated does not match the signature you provided_”.

Origin Response
---------------

This function intercepts responses on cache misses only.

The event passed to the functions contains both the request decorated by _Viewer Request_ and the response from the Origin.

We add a `Set-Cookie` header to be sure the browser will send the same cookie on every future request. The cookie `Path` guarantees three is a single cookie, regardless the path of the object.

You probably noticed all parameters are hardwired in the code. This is not due to my bad Node.js code. [Lambda@Edge does not support passing configuration to functions as environment variables](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-requirements-limits.html#lambda-requirements-lambda-function-configuration). Not to hardwire parameters, you must inject them at function build and deploy time.

Function Execution Role
-----------------------

Lambda@Edge functions require an execution role the same way as “normal” Lambda. If you are not accessing any external resources (you’d better not to) the standard `AWSLambdaBasicExecutionRole` will suffice. It allows functions to send logs to CloudWatch.

Attaching Lambda@Edge to CloudFront Distribution
------------------------------------------------

Association between Lambda and CloudFront Distribution is at Behaviour level.

Modify the Behaviour and wait for the Distribution change to completely propagate before trying any test.

All functions must be published with a numbered version ($LATEST is not supported). This is a [documented](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-requirements-limits.html#lambda-requirements-cloudfront-triggers), but not so obvious limitation.

Gotchas
=======

Gotcha! (by Bill Larkins, from Wikipedia)

I reckon Lambda@Edge are quite new. Official documentation is sparse at best, and examples are usually naive and not much realistic. In a head-breaking cut&try process I gathered a number of gotchas. Some of them are documented, well hidden or not obvious at all (at least to me).

N.Virginia AWS Region only
--------------------------

Lambda functions must be created in `us-east-1` Region to be attached to CloudFront Distributions.

This is the same restriction that applies to other attached to the global CDN, like SSL certificates stored in Amazon Certificate Managers to use https on custom domains.

No environment for Lamba@Edge
-----------------------------

As already mentioned, the configuration must be hardwired in the code, as no environment variable is supported.

Lamba@Edge also has some other [noteworthy limitations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-requirements-limits.html#lambda-requirements-lambda-function-configuration).

Execution logs roam across CloudWatch Regions
---------------------------------------------

Execution logs from Lambda@Edge functions go to CloudWatch, as for normal Lambda functions, but the Region logs end up in is not obvious.

Logs go to the Region of the Edge Location the function is executed in.

This is the Edge Location the client request is directed to. It is usually the Location closest to the client, but not necessarily. I saw my requests from London switching from `LHR` (West London) Edge Location to `AMS` (Amsterdam). As a result, Lambda@Edge logs switching between `eu-west-2` and `eu-central-1` Regions.

Log Groups get qualified with the name of Region the function is stored in (not where it is executed). So the Log Group is always`/aws/lambda/us-east-1.<function-name>`…except when function executes in `us-east-1`, as it happens when you run it from AWS Console for debugging. In this case the Log Group `/aws/lambda/<function-name>`

Change Host header when changing Origin
---------------------------------------

If you change the Origin, don’t forget to change the \`Host\` header accordingly, to avoid “_The request signature we calculated does not match the signature you provided_” errors.

Switching Origin in Origin Request only
---------------------------------------

The request Origin may be changed only in _Origin Request,_ not in _Viewer Request_. This way the response get always cached.

Do not forget to set up the Default Behaviour to forward the element you are using for deciding the Origin (the cookie, in our case), or the _Origin Request_ function would not receive it.

This also brings to the next gotcha…

Forwarded Cookies are part of the cache key
-------------------------------------------

A forwarded cookie becomes part of the cache key, along with the object URI, regardless the Origin is ignoring it (e.g. S3).

Cache invalidation drops all versions of an object
--------------------------------------------------

Invalidation is by URI only. There is no way of invalidating a single version of an object (e.g. associated with one `X-Source=Experiment`)

Deleting functions used as Lambda@Edge
--------------------------------------

This is probably the most annoying gotcha.

You obviously cannot delete a Lambda function while associated with a CloudFront Distribution. What is not obvious is you have to wait the function is completely removed from CDN replication before deleting it.

Until very recently there was no way of removing replicated functions, making users very… [disappointed](https://forums.aws.amazon.com/thread.jspa?threadID=260242).

At the time of writing (February 2018), when you remove all associations to CloudFront Distributions, function replica are dropped after… a while.

I cannot exactly quantify the time it takes. It is not documented and there is no way of verifying the replication status through AWS Console or API/CLI. It does not look related to the Distribution deployment and I was able to delete detached functions after a variable time between 30 minutes to 24 hours.

This makes Lambda used at Edge not easily manageable by stateful infrastructure provisioning tools, like CloudFront or [Terraform](https://github.com/terraform-providers/terraform-provider-aws/issues/1721).

Conclusions
===========

Lambda@Edge opens a number of very interesting use cases. Unfortunately, documentation is still poor, examples not so useful and tooling support non-existent or sparse.

The many limitations reduce possible uses. Also, you should avoid any heavyweight processing or access to external resources when running from Edge, or you give up any benefit of using a CDN.

Regardless limitations, implementing A/B testing is not so complex.

Improvements Done
==================

Shared Repository manages the muliple cookies, as server cookies were overridden by lambda.

Reference: https://medium.com/buildit/a-b-testing-on-aws-cloudfront-with-lambda-edge-a22dd82e9d12
