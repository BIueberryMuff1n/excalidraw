import {
  LibraryIcon,
  presentationIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen, useExcalidrawAPI } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppWelcomeScreen: React.FC<{
  onCollabDialogOpen: () => any;
  isCollabEnabled: boolean;
}> = React.memo((props) => {
  const { t } = useI18n();
  const excalidrawAPI = useExcalidrawAPI();

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo />
        <WelcomeScreen.Center.Heading>
          Homeport Studio on home-01
          <br />
          Boards persist locally &amp; sync to /data/boards
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItem
            onSelect={() =>
              excalidrawAPI?.toggleSidebar({ name: "default", tab: "boards" })
            }
            shortcut={null}
            icon={LibraryIcon}
          >
            Open Server Boards (home-01)
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem
            onSelect={() =>
              excalidrawAPI?.toggleSidebar({ name: "default", tab: "carl" })
            }
            shortcut={null}
            icon={presentationIcon}
          >
            Carl / Technical Illustration Bridge
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItemLoadScene />
          <WelcomeScreen.Center.MenuItemHelp />
          {props.isCollabEnabled && (
            <WelcomeScreen.Center.MenuItemLiveCollaborationTrigger
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
