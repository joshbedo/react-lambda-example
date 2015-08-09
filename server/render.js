import path from 'path';
import fs from 'fs';
import url from 'url';
import React from 'react';
import Router from 'react-router';
import result from 'lodash/object/result';
import findLast from 'lodash/collection/findLast';

import HtmlDocument from '../src/components/HtmlDocument/HtmlDocument';
import { getRoutes } from '../src/router/route-helpers';

/**
 * Returns a JSON array with paths to JS and CSS file, generated by webpack.
 */
function getWebpackPaths() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'bundles', 'webpack-stats.json')));
}

/**
 * Cleans up the pathname part of the url.
 * @param  {String} urlStr Url string to clean.
 * @return {String}        Returns cleaned up url.
 */
function normalizeUrl(urlStr) {
  // Creates an object out of the url string.
  const parsedUrl = url.parse((urlStr || '').toLowerCase());
  // Removes slashes at the beginning and end of pathname.
  parsedUrl.pathname = parsedUrl.pathname.replace(/^\/|\/$/g, '');
  // Adds back slashes or replaces pathname with a single slash if it was falsy.
  parsedUrl.pathname = parsedUrl.pathname ? `/${parsedUrl.pathname}/` : '/';
  // Returns back the url string.
  return url.format(parsedUrl);
}

export function render(requestUrl) {
  return new Promise(function(resolve, reject) {
    // Gets the normalized url.
    const reqUrl = normalizeUrl(requestUrl);
    // Get all routes config.
    const routes = getRoutes();

    // Creates a new react-router object, with routes config, and current url.
    const router = Router.create({
      onAbort(abortReason) {
        reject(abortReason);
      },
      onError(err) {
        reject(err);
      },
      routes,
      location: reqUrl,
    });

    // Generates a handler for current route path.
    router.run(function(Handler, state) {
      // Gets the name of given route.
      const routeName = result(findLast(state.routes.slice(), 'name'), 'name');
      // Generates new state properties.
      const stateProps = {
        routeName: routeName || 'home',
        pathname: state.pathname,
      };

      // Generates the requested page markup.
      const markup = React.renderToString(<Handler {...stateProps} />);
      // Gets JS and CSS paths of files generated by webpack.
      const webpackUrls = getWebpackPaths();

      // The application component is rendered to static markup
      // and sent as response.
      const html = React.renderToStaticMarkup(
        <HtmlDocument
          markup={markup}
          script={webpackUrls.script}
          css={webpackUrls.css}
          router={router}
          dataRender={stateProps}
          {...stateProps} />
      );
      const doctype = '<!DOCTYPE html>';
      resolve([requestUrl, doctype + html]);
    });
  });
}

/**
 * Middle ware used to serve HTML content rendered based on the react-router path.
 * Content is rendered in form of the index.html page created as a react component.
 * @param  {Object}   req  Express request object.
 * @param  {Object}   res  Express response object.
 * @param  {Function} next Callback passing control to the next handler.
 */
export function renderFromRequest(req, res, next) {
  // Checking if request is for HTML content.
  const isHtml = req.headers.accept && req.accepts('html');

  // Skip not found assets
  // If not request for HTML content, pass control to the next handler.
  if (!isHtml) { return next(); }

  render(req.url)
  .then(([, htmlOutput]) => {
    res.send(htmlOutput);
  })
  .catch(errorReason => {
    next(errorReason);
  });
}
