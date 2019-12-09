/**
 * ForceNG - REST toolkit for Salesforce.com
 * Author: Christophe Coenraets @ccoenraets
 * Version: 0.6.1
 */
angular.module('forceng', [])

  .factory('force', function ($rootScope, $q, $window, $http) {

    // The login URL for the OAuth process
    // To override default, pass loginURL in init(props)
    var loginURL = 'https://login.salesforce.com',

    // The Connected App client Id. Default app id provided - Not for production use.
    // This application supports http://localhost:8200/oauthcallback.html as a valid callback URL
    // To override default, pass appId in init(props)
      appId = '3MVG9fMtCkV6eLheIEZplMqWfnGlf3Y.BcWdOf1qytXo9zxgbsrUbS.ExHTgUPJeb3jZeT8NYhc.hMyznKU92',

    // The force.com API version to use.
    // To override default, pass apiVersion in init(props)
      apiVersion = 'v45.0', //updated to Winter '19

    // Keep track of OAuth data (access_token, refresh_token, and instance_url)
      oauth,

    // By default we store fbtoken in sessionStorage. This can be overridden in init()
      tokenStore = {},

    // if page URL is http://localhost:3000/myapp/index.html, context is /myapp
      context = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/")),

    // if page URL is http://localhost:3000/myapp/index.html, serverURL is http://localhost:3000
      serverURL = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : ''),

    // if page URL is http://localhost:3000/myapp/index.html, baseURL is http://localhost:3000/myapp
      baseURL = serverURL + context,

    // Only required when using REST APIs in an app hosted on your own server to avoid cross domain policy issues
    // To override default, pass proxyURL in init(props)
      proxyURL = baseURL,

    // if page URL is http://localhost:3000/myapp/index.html, oauthCallbackURL is http://localhost:3000/myapp/oauthcallback.html
    // To override default, pass oauthCallbackURL in init(props)
      oauthCallbackURL = baseURL + '/oauthcallback.html',

    // Because the OAuth login spans multiple processes, we need to keep the login success and error handlers as a variables
    // inside the module instead of keeping them local within the login function.
      deferredLogin,

      deferredLogout,

    // Reference to the Salesforce OAuth plugin
      oauthPlugin,

    // Reference to the Salesforce Network plugin
      networkPlugin,

    // Whether or not to use a CORS proxy. Defaults to false if app running in Cordova or in a VF page
    // Can be overriden in init()
      useProxy = (window.cordova || window.SfdcApp || window.sforce) ? false : true;

    /*
     * Determines the request base URL.
     */
    function getRequestBaseURL() {

      var url;

      if (useProxy) {
        url = proxyURL;
      } else if (oauth && oauth.instance_url) {
        url = oauth.instance_url;
      } else {
        url = serverURL;
      }

      // dev friendly API: Remove trailing '/' if any so url + path concat always works
      if (url.slice(-1) === '/') {
        url = url.slice(0, -1);
      }

      return url;
    }

    function parseQueryString(queryString) {
      var qs = decodeURIComponent(queryString),
        obj = {},
        params = qs.split('&');
      params.forEach(function (param) {
        var splitter = param.split('=');
        obj[splitter[0]] = splitter[1];
      });
      return obj;
    }

    function toQueryString(obj) {
      var parts = [],
        i;
      for (i in obj) {
        if (obj.hasOwnProperty(i)) {
          parts.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj[i]));
        }
      }
      return parts.join("&");
    }

    function refreshTokenWithPlugin(deferred) {
      oauthPlugin.authenticate(
        function (response) {
          oauth.access_token = response.accessToken;
          tokenStore.forceOAuth = JSON.stringify(oauth);
          deferred.resolve();
        },
        function () {
          console.log('Error refreshing oauth access token using the oauth plugin');
          deferred.reject();
        });
    }

    function refreshTokenWithHTTPRequest(deferred) {
      var params = {
          'grant_type': 'refresh_token',
          'refresh_token': oauth.refresh_token,
          'client_id': appId
        },

        headers = {},

        url = useProxy ? proxyURL : loginURL;

      // dev friendly API: Remove trailing '/' if any so url + path concat always works
      if (url.slice(-1) === '/') {
        url = url.slice(0, -1);
      }

      url = url + '/services/oauth2/token?' + toQueryString(params);

      if (!useProxy) {
        headers["Target-URL"] = loginURL;
      }

      $http({
        headers: headers,
        method: 'POST',
        url: url,
        params: params
      })
        .then(function (response) {
          console.log('Token refreshed');
          oauth.access_token = response.data.access_token;
          tokenStore.forceOAuth = JSON.stringify(oauth);
          deferred.resolve();
        },
        function (response) {
          console.log('Error while trying to refresh token');
          deferred.reject();
        });
    }

    function refreshToken() {
      var deferred = $q.defer();
      if (oauthPlugin) {
        refreshTokenWithPlugin(deferred);
      } else {
        refreshTokenWithHTTPRequest(deferred);
      }
      return deferred.promise;
    }

    /**
     * Initialize ForceNG
     * @param params
     *  appId (optional)
     *  loginURL (optional)
     *  proxyURL (optional)
     *  oauthCallbackURL (optional)
     *  apiVersion (optional)
     *  accessToken (optional)
     *  instanceURL (optional)
     *  refreshToken (optional)
     */
    function init(params) {

      if (params) {
        appId = params.appId || appId;
        apiVersion = params.apiVersion || apiVersion;
        loginURL = params.loginURL || loginURL;
        oauthCallbackURL = params.oauthCallbackURL || oauthCallbackURL;
        proxyURL = params.proxyURL || proxyURL;
        useProxy = params.useProxy === undefined ? useProxy : params.useProxy;

        if (params.accessToken) {
          if (!oauth) oauth = {};
          oauth.access_token = params.accessToken;
        }

        if (params.instanceURL) {
          if (!oauth) oauth = {};
          oauth.instance_url = params.instanceURL;
        }else if(params.instanceUrl) {
          if (!oauth) oauth = {};
          oauth.instance_url = params.instanceUrl;
        }else if(params.instance_url) {
          if (!oauth) oauth = {};
          oauth.instance_url = params.instance_url;
        }

        if (params.refreshToken) {
          if (!oauth) oauth = {};
          oauth.refresh_token = params.refreshToken;
        }

        if (_.get(params, 'userId')) {
          if (!oauth) oauth = {};
          oauth.userId = params.userId;
        }
      }

      console.log("useProxy: " + useProxy);
    }

    function getOAuth(){
        return oauth;
    }

    /**
     * Discard the OAuth access_token. Use this function to test the refresh token workflow.
     */
    function discardToken() {
      delete oauth.access_token;
      tokenStore.forceOAuth = JSON.stringify(oauth);
    }

    /**
     * Called internally either by oauthcallback.html (when the app is running the browser)
     * @param url - The oauthCallbackURL called by Salesforce at the end of the OAuth workflow. Includes the access_token in the querystring
     */
    function oauthCallback(url) {

      // Parse the OAuth data received from Facebook
      var queryString,
        obj;

      if (url.indexOf("access_token=") > 0) {
        queryString = url.substr(url.indexOf('#') + 1);
        obj = parseQueryString(queryString);
        oauth = obj;
        tokenStore['forceOAuth'] = JSON.stringify(oauth);
        if (deferredLogin) deferredLogin.resolve(oauth);
      } else if (url.indexOf("error=") > 0) {
        queryString = decodeURIComponent(url.substring(url.indexOf('?') + 1));
        obj = parseQueryString(queryString);
        if (deferredLogin) deferredLogin.reject(obj);
      } else {
        if (deferredLogin) deferredLogin.reject({status: 'access_denied'});
      }
    }

    /**
     * Login to Salesforce using OAuth. If running in a Browser, the OAuth workflow happens in a a popup window.
     */
    function login() {
      deferredLogin = $q.defer();
      if (window.cordova) {
        loginWithPlugin();
      } else {
        loginWithBrowser();
      }
      return deferredLogin.promise;
    }

    function loginWithPlugin() {
      document.addEventListener("deviceready", function () {
        oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
        networkPlugin = cordova.require("com.salesforce.plugin.network");
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
          if (deferredLogin) deferredLogin.reject({status: 'Salesforce Mobile SDK OAuth plugin not available'});
          return;
        }

        var authSuccess = function authSuccess(creds) {
          // Initialize ForceJS
          init({accessToken: creds.accessToken, instanceURL: creds.instanceUrl, refreshToken: creds.refreshToken, userId: creds.userId});
          if (deferredLogin) deferredLogin.resolve(oauth);
        };

        var authFailure = function(error) {
          console.log(error);
          if (deferredLogin) deferredLogin.reject(error);
        };

        oauthPlugin.getAuthCredentials(
          authSuccess,
          function() {
              oauthPlugin.authenticate(
                  authSuccess,
                  authFailure
              );
          }
        );
        
      }, false);
    }

    function loginWithBrowser() {
      console.log('loginURL: ' + loginURL);
      console.log('oauthCallbackURL: ' + oauthCallbackURL);

      var loginWindowURL = loginURL + '/services/oauth2/authorize?client_id=' + appId + '&redirect_uri=' +
        oauthCallbackURL + '&response_type=token';
      window.open(loginWindowURL, '_blank', 'location=no');
    }

    function logout(){
      deferredLogout = $q.defer();
      if (window.cordova) {
        logoutWithPlugin();
      } else {
        logoutWithBrowser();
      }
      return deferredLogout.promise;
    }

    function logoutWithPlugin(){
      document.addEventListener("deviceready", function () {
        oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
          if (deferredLogin) deferredLogin.reject({status: 'Salesforce Mobile SDK OAuth plugin not available'});
          return;
        }
        //logout method doesn't support callbacks.
        oauthPlugin.logout();
        if (deferredLogout) deferredLogout.resolve();

      }, false);
    }

    function logoutWithBrowser(){
        if (deferredLogout) deferredLogout.resolve();
    }

    /**
     * Gets the user's ID (if logged in)
     * @returns {string} | undefined
     */
    function getUserId() {
        //oauth.id could be undefined. it will throw error.
        if(typeof(oauth) !== 'undefined') {
            if(oauth.id) {
                return oauth.id.split('/').pop();
            }
        }
        return undefined;
    }

    /**
     * Check the login status
     * @returns {boolean}
     */
    function isAuthenticated() {
      return (oauth && oauth.access_token) ? true : false;
    }

    /**
     * Lets you make any Salesforce REST API request.
     * @param obj - Request configuration object. Can include:
     *  method:  HTTP method: GET, POST, etc. Optional - Default is 'GET'
     *  path:    path in to the Salesforce endpoint - Required
     *  params:  queryString parameters as a map - Optional
     *  data:  JSON object to send in the request body - Optional
     */
    function request(obj) {
        // NB: networkPlugin will be defined only if login was done through plugin and container is using Mobile SDK 5.0 or above
    // turn off CordovaNetwork request, because file:// and CORS issue in iOS10.
        if (networkPlugin) {
            return requestWithPlugin(obj);
        } else {
            return requestWithBrowser(obj);
        }
    }

    /**
     * @param path: full path or path relative to end point - required
     * @param endPoint: undefined or endpoint - optional
     * @return object with {endPoint:XX, path:relativePathToXX}
     *
     * For instance for undefined, '/services/data'     => {endPoint:'/services/data', path:'/'}
     *                  undefined, '/services/apex/abc' => {endPoint:'/services/apex', path:'/abc'}
     *                  '/services/data, '/versions'    => {endPoint:'/services/data', path:'/versions'}
     */
    function computeEndPointIfMissing(endPoint, path) {
        if (endPoint !== undefined) {
            return {endPoint:endPoint, path:path};
        }
        else {
            var parts = path.split('/').filter(function(s) { return s !== ""; });
            if (parts.length >= 2) {
                return {endPoint: '/' + parts.slice(0,2).join('/'), path: '/' + parts.slice(2).join('/')};
            }
            else {
                return {endPoint: '', path:path};
            }
        }
    }

    function requestWithPlugin(obj) {
      var deferred = $q.defer();
      var obj2 = computeEndPointIfMissing(obj.endPoint, obj.path);

      networkPlugin.sendRequest(obj2.endPoint, obj2.path, function(data){
        //success
        deferred.resolve(data);
      }, function(errorResp){
        //failure
        if (typeof errorResp === "string") {
          // test if it is a json string
          try {
            errorResp = JSON.parse(errorResp);
          } catch (e) {
            var respArray = [];
            respArray.push({
              message: errorResp
            })
            errorResp = respArray;
          }
        }

        // workaround to have consistent response format to request Calls
        if (!Array.isArray(errorResp)) {
          var respArray = []
          respArray.push({
            message: _.get(errorResp, 'NSLocalizedDescription', "Error encountered check error code"),
            error: _.get(errorResp, 'error', "Check debug log")
          });
          errorResp['error'] = respArray;
        }

        deferred.reject(_.get(errorResp, 'error', errorResp));
      }, obj.method, obj.data || obj.params, obj.headerParams);

      return deferred.promise;
      }

    function requestWithBrowser(obj, shouldNotRefreshToken) {
      var method = obj.method || 'GET',
        headers = {},
        url = getRequestBaseURL(),
        deferred = $q.defer();

      if (!oauth || (!oauth.access_token && !oauth.refresh_token)) {
        deferred.reject('No access token. Login and try again.');
        return deferred.promise;
      }

      // dev friendly API: Add leading '/' if missing so url + path concat always works
      if (obj.path.charAt(0) !== '/') {
        obj.path = '/' + obj.path;
      }

      url = url + obj.path;

      headers["Authorization"] = "Bearer " + oauth.access_token;
      if (obj.contentType) {
        headers["Content-Type"] = obj.contentType;
      }
      if (useProxy && oauth.instance_url) {
        headers["Target-URL"] = oauth.instance_url;
      }

      $http({
        headers: headers,
        method: method,
        url: url,
        params: obj.params,
        data: obj.data,
        timeout: 115000
      }).then(function (response) {
          deferred.resolve(response.data);
        }, function (response) {
          if ((response.status === 401 || response.status === 403) && oauth.refresh_token) {

            if (shouldNotRefreshToken) {
              deferred.reject(response.data);
              // skip refreshToken
              return;
            }

            refreshToken()
              .then(function () {
                if (typeof (cookieMaster) !== 'undefined' &&  ionic && ionic.Platform.isIOS()) {
                    cookieMaster.setCookieValue(oauth.instance_url, 'sid', oauth.access_token,
                        function () {
                            console.log('A cookie has been set');
                        },
                        function (error) {
                            console.log('Error setting cookie: ' + error);
                        });
                }

                // Try again with the new token
                requestWithBrowser(obj, true).then(function(data) {
                    deferred.resolve(data);
                }, function(error){
                    deferred.reject(error);
                });
              }, function(){

                var res = [{
                  'errorCode': 'Request Error or Timed Out',
                  'message': "Refresh token expired."
                }];
                console.error(res);

                deferred.reject(res);

            });
          } else {
              if (!response) {
                response = [{
                      'errorCode': 'Request Error or Timed Out',
                      'message': 'Server connection timeout! Please try again!'

                 }];
              }

            deferred.reject(response.data);
          }

        });

      return deferred.promise;
  }

    /**
     * Execute SOQL query
     * @param soql
     * @returns {*}
     */
    function query(soql) {

      return request({
        path: '/services/data/' + apiVersion + '/query',
        params: {q: soql}
      });

    }

    /**
     * Retrieve a record based on its Id
     * @param objectName
     * @param id
     * @param fields
     * @param params // Used to pass in a param, such as nocache to avaid caching on http request
     * @returns {*}
     */
    function retrieve(objectName, id, fields, params) {
      var params = params || {};
      if (fields) {
          params["fields"] = fields;
      }
      return request({
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
        params: fields ? {fields: (typeof fields === "string" ? fields : fields.join(","))} : undefined
      });

    }

    /**
     * Create a record
     * @param objectName
     * @param data
     * @returns {*}
     */
    function create(objectName, data) {

      return request({
        method: 'POST',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/',
        data: data
      });

    }

    /**
     * Update a record
     * @param objectName
     * @param data
     * @returns {*}
     */
    function update(objectName, data) {

      var id = data.Id,
        fields = angular.copy(data);

      delete fields.attributes;
      delete fields.Id;

      return request({
        method: 'PATCH',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
        data: fields
      });

    }

    /**
     * Delete a record
     * @param objectName
     * @param id
     * @returns {*}
     */
    function del(objectName, id) {

      return request({
        method: 'DELETE',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id
      });

    }

    /**
     * Upsert a record
     * @param objectName
     * @param externalIdField
     * @param externalId
     * @param data
     * @returns {*}
     */
    function upsert(objectName, externalIdField, externalId, data) {

      return request({
        method: 'PATCH',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + externalIdField + '/' + externalId,
        data: data
      });

    }

    /**
     * Convenience function to invoke APEX REST endpoints
     * @param pathOrParams
     * @param successHandler
     * @param errorHandler
     */
    function apexrest(pathOrParams) {

      var params;

      if (pathOrParams.substring) {
        params = {path: pathOrParams};
      } else {
        params = pathOrParams;

        if (params.path.charAt(0) !== "/") {
          params.path = "/" + params.path;
        }

        if (params.path.substr(0, 18) !== "/services/apexrest") {
          params.path = "/services/apexrest" + params.path;
        }
      }

      return request(params);
    }

    /**
     * Convenience function to invoke the Chatter API
     * @param params
     * @param successHandler
     * @param errorHandler
     */
    function chatter(params) {

      var base = "/services/data/" + apiVersion + "/chatter";

      if (!params || !params.path) {
        errorHandler("You must specify a path for the request");
        return;
      }

      if (params.path.charAt(0) !== "/") {
        params.path = "/" + params.path;
      }

      params.path = base + params.path;

      return request(params);

    }

    function getURLs() {
      return {proxyURL:proxyURL,oauthCallbackURL:oauthCallbackURL, useProxy: useProxy};
    }

    function isOnMobile() {
      return true;
    }

    // The public API
    return {
      init: init,
      getOAuth: getOAuth,
      login: login,
      logout: logout,
      getUserId: getUserId,
      isAuthenticated: isAuthenticated,
      request: request,
      query: query,
      create: create,
      update: update,
      del: del,
      upsert: upsert,
      retrieve: retrieve,
      apexrest: apexrest,
      chatter: chatter,
      discardToken: discardToken,
      oauthCallback: oauthCallback,
      requestBaseURL:getRequestBaseURL,
      getURLs: getURLs,
      isOnMobile: isOnMobile
    };

  });

// Global function called back by the OAuth login dialog
function oauthCallback(url) {
  var injector = angular.element(document.body).injector();
  injector.invoke(function (force) {
    force.oauthCallback(url);
  });
}
