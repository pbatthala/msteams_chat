import {ipcMain, app, BrowserWindow, clipboard, dialog, screen, Point, Tray, Menu} from "electron";
import * as fs from "fs";
import {Utils} from "../utils";
import {Microsoft} from "../ms_api/teams";
import * as path from "path";
import * as active_window from "active_window";

// const backend_events_pipe = 'backend-events-pipe';
const ui_events_pipe = 'ui-events-pipe';

export class ChatWindow extends BrowserWindow {
    private tray : Tray | null = null;
    private isManualHidden : boolean = false;

    constructor(private teams_api?: Microsoft.API.Teams | null, private readyToShow?: Function){
        super({
            width: 500, // 250 *2
            height: screen.getPrimaryDisplay().bounds.height/2,
            // maxHeight: screen.getPrimaryDisplay().bounds.height,
            webPreferences: {
                nodeIntegration: true,
                devTools: false,
            },
            show: false,
            resizable: false,
            //alwaysOnTop: true,
            frame: false,
            transparent: true,
            focusable: false,
            // skipTaskbar: true
        });

        this.loadFile('dist/ui/chat.html');

        this.bind_events();
        this.bind_user_events();
    }

    private bind_events(){
        this.webContents.once('did-finish-load', () => {
            this.setAlwaysOnTop(true);
            this.setIgnoreMouseEvents(true, {
                forward: true
            });
            this.setPosition(screen.getPrimaryDisplay().bounds.width-this.getBounds().width, 50);
            
            if(this.readyToShow) this.readyToShow();
        });

        if(active_window.getActiveWindow){
            let lastActiveWindow;
            setInterval(() => {
                lastActiveWindow = active_window.getActiveWindow();
                if(lastActiveWindow.process_path){
                    if(path.basename(lastActiveWindow.process_path) == "Teams.exe"){
                        this.webContents.send(ui_events_pipe, "hide_chat");
                    }else if(!this.isManualHidden){
                        this.webContents.send(ui_events_pipe, "show_chat");
                    }
                }
            }, 500);
        }
    }

    private bind_user_events(){
        let poll_events = (next?: string) => {
            this.teams_api?.make_poll_event(next).then((response) => {
                if(response.data){
                    if(Utils.objectIsValid(response.data.eventMessages)){
                        response.data.eventMessages.forEach((curMsg: any) => {
                            if(!Utils.objectIsValid(curMsg)) return;

                            let messageTemplate = {
                                type: 'string',
                                resourceLink: 'string',
                                resourceType: 'string',
                                resource: {
                                    id: 'string/number',
                                    imdisplayname: 'string',
                                    content: 'string',
                                    messagetype: 'string'
                                }
                            };
                            
                            if(Utils.structIsValid(messageTemplate, curMsg) && curMsg.resourceLink.search(this.teams_api?.chat_id) != -1 && curMsg.type == 'EventMessage' && curMsg.resourceType == 'NewMessage'){
                                if(/(Text|RichText\/Html)/gi.test(curMsg.resource.messagetype)){
                                    this.webContents.send(ui_events_pipe, 'new_message', {
                                        author: curMsg.resource.imdisplayname,
                                        content: curMsg.resource.content,
                                        message_type: curMsg.resource.messagetype,
                                        message_id: curMsg.resource.id
                                    });
                                }
                            }
                        });
                    }

                    if(Utils.objectIsValid(response.data.next)) poll_events(response.data.next);
                }
            }).catch(() => {});
        };
        poll_events();

        ipcMain.on(ui_events_pipe, (event, msg) => {
            if(msg){
                if(msg == 'put-to-tray'){
                    let iconPath = path.resolve(app.getAppPath(), 'dist/ui/img/teams_logo.png');
                    this.tray = new Tray(iconPath);

                    this.tray.setTitle('MSTeams Chat');
                    this.tray.setContextMenu(Menu.buildFromTemplate([
                        {
                            label: 'Скрыть/показать чат',
                            click: () => {
                                if(!this.isManualHidden){
                                    this.webContents.send(ui_events_pipe, "hide_chat");
                                    this.isManualHidden = true;
                                }else{
                                    this.webContents.send(ui_events_pipe, "show_chat");
                                    this.isManualHidden = false;
                                }
                            }
                        },
                        {
                            label: 'Выйти',
                            click: () => {
                                this.tray?.destroy();
                                app.quit();
                            }
                        }
                    ]));
                }
            }
        });

        // setInterval(() => {
        //     this.webContents.send(ui_events_pipe, 'new_message', {
        //         author: 'Груднистый Алексей Павлович',
        //         content: `Time now: ${Date.now()/1000}`
        //         // content: `${Date.now()}Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc feugiat interdum turpis vitae tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque quis blandit justo. Vestibulum mattis consequat commodo. Vivamus finibus velit felis, in vestibulum lectus lobortis quis. Sed nec porta turpis, eget condimentum lacus. Proin molestie rhoncus ex, tempor convallis purus porttitor non. Maecenas ac pellentesque libero, ac tempor ipsum.`
        //     });
        // }, 1000);
    }
}
