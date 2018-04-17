import {
  BBAuth,
  BBAuthTokenErrorCode
} from '../auth';

import { BBAuthInterop } from '../shared/interop';

import { BBCsrfXhr } from '../shared/csrf-xhr';
import { BBAuthDomUtility } from '../shared/dom-utility';
import { BBAuthNavigator } from '../shared/navigator';

import { BBContextArgs } from './context-args';
import { BBContextNavigation } from './context-navigation';

function showPicker(
  args: BBContextArgs,
  navigation: BBContextNavigation,
  resolve: (args: BBContextArgs) => void,
  reject: (reason: { reason: string }) => void
) {
  let styleEl: HTMLStyleElement;
  let iframeEl: HTMLIFrameElement;

  function addStyleEl() {
    styleEl = BBAuthDomUtility.addCss(`
.sky-omnibar-welcome-iframe {
  background-color: #fff;
  border: none;
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  z-index: 10000;
}
`
    );
  }

  function addIframeEl() {
    const iframeUrl =
      BBContextProvider.url +
      '?hosted=1&svcid=' + encodeURIComponent(args.svcId) +
      '&url=' + encodeURIComponent(args.url);

    iframeEl = BBAuthDomUtility.addIframe(
      iframeUrl,
      'sky-omnibar-welcome-iframe',
      'Welcome'
    );
  }

  function handleGetToken(
    tokenRequestId: any,
    disableRedirect: boolean
  ) {
    BBAuth.getToken({
      disableRedirect
    })
      .then(
        (token: string) => {
          BBAuthInterop.postOmnibarMessage(
            iframeEl,
            {
              messageType: 'token',
              token,
              tokenRequestId
            }
          );
        },
        (reason: any) => {
          BBAuthInterop.postOmnibarMessage(
            iframeEl,
            {
              messageType: 'token-fail',
              reason,
              tokenRequestId
            }
          );
        }
      );
  }

  function destroy() {
    document.body.removeChild(iframeEl);

    BBAuthDomUtility.removeCss(styleEl);

    iframeEl =
      styleEl =
      undefined;

    window.removeEventListener('message', messageHandler);
  }

  function messageHandler(event: MessageEvent) {
    if (!BBAuthInterop.messageIsFromOmnibar(event)) {
      return;
    }

    const message = event.data;

    switch (message.messageType) {
      case 'ready':
        BBAuthInterop.postOmnibarMessage(
          iframeEl,
          {
            messageType: 'host-ready'
          }
        );

        BBAuthInterop.postOmnibarMessage(
          iframeEl,
          {
            contextNavigation: navigation,
            messageType: 'context-provide'
          }
        );

        break;
      case 'get-token':
        handleGetToken(
          message.tokenRequestId,
          message.disableRedirect
        );
        break;
      case 'welcome-cancel':
        destroy();

        reject({
          reason: 'canceled'
        });

        break;
      case 'welcome-environment-selected':
        destroy();

        // Calling resolve() immediately after removing the IFRAME oddly causes the disappearance of the IFRAME
        // to be delayed.  Use setTimeout() to let the IFRAME disappear before resolving.
        setTimeout(() => {
          args.envId = message.envId;
          resolve(args);
        }, 10);

        break;
    }
  }

  addStyleEl();
  addIframeEl();

  window.addEventListener('message', messageHandler);
}

function redirectToError() {
  BBAuthNavigator.redirectToError(BBAuthTokenErrorCode.InvalidEnvironment);
}

export class BBContextProvider {

  public static url = 'https://host.nxt.blackbaud.com/omnibar/welcome';

  public static ensureContext(args: BBContextArgs): Promise<BBContextArgs> {
    const { envId, envIdRequired, svcId } = args;

    if (envId || !envIdRequired) {
      return Promise.resolve(args);
    }

    return new Promise<BBContextArgs>((resolve, reject) => {
      if (svcId) {
        BBAuth.getToken()
          .then((token) => {
            const url = 'https://s21anavnavaf00blkbapp01.sky.blackbaud.com/user/services?svcid=' +
              encodeURIComponent(svcId);

            BBCsrfXhr.requestWithToken(
              url,
              token
            ).then((navigation: BBContextNavigation) => {
              const environments = navigation.environments;
              const environmentCount = (environments && environments.length) || 0;

              if (environmentCount === 1) {
                // Default to the only environment.
                args.envId = environments[0].id;
                resolve(args);
              } else if (environmentCount > 1) {
                // Let the user pick an environment.
                showPicker(args, navigation, resolve, reject);
              } else {
                // The user is not in an environment.  Redirect to the error page.
                redirectToError();
              }
            });
        });
      } else {
        // The nav service will only return environments when a service ID is provided,
        // so there's no need to call it.  Just redirect to the error page.
        redirectToError();
      }
    });
  }

}
