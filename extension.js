/**
 * All-in-one Places extension for Gnome Shell.
 * http://jferrao.github.com/gtk
 * 
 * 
 * @author jferrao <jferrao@ymail.com>
 * @version 2.0
 * 
 */



/**
 * Import stuff ...
 */
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext;
const _ = Gettext.gettext;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const PlaceDisplay = Me.imports.placeDisplay;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.lib;



const EXTENSION_UUID = "all-in-one-places@addadi";
const SCHEMA_NAME = "org.gnome.shell.extensions.AllInOnePlaces";


/**
 * Messages for the confirmation dialog boxes.
 */
const EMPTY_TRASH_LABEL     = _("Empty Trash");
const EMPTY_TRASH_MESSAGE   = _("Are you sure you want to delete all items from the trash?") + "\n" + _("This operation cannot be undone.") + "\n";
const EJECT_DEVICE_LABEL    = _("Eject");
const EJECT_DEVICE_MESSAGE  = _("Are you sure you want to eject this device ?") + "\n";
const CLEAR_RECENT_LABEL    = _("Recent documents");
const CLEAR_RECENT_MESSAGE  = _("Clear the Recent Documents list?") + "\n";


let settings, labelClass;


/**
 * Menu item base class
 */
function MenuItemBase()
{
    this._init.apply(this, arguments);
}

MenuItemBase.prototype =
{
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,
    
    _init: function(icon, text, params)
    {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        let label = new St.Label({ text: text });
        this.addActor(label);
        if (icon.substring) {
            icon = new St.Icon({ icon_name: icon, icon_size: settings.get_int('item-icon-size') });
        }
        //this.addActor(icon, { align: St.Align.END, span: -1 });
        this.addActor(icon, { align: St.Align.END, span: -1 });
        
        return this;
    }
};

/**
 * Device menu item class
 */
function MenuItem()
{
    this._init.apply(this, arguments);
}

MenuItem.prototype =
{
    __proto__: MenuItemBase.prototype,
    
    _init: function(icon, text, launcher, params)
    {
        MenuItemBase.prototype._init.call(this, icon, text, params);

        if (launcher != undefined) {
            this.connect('activate', function(actor, event) {
                new launch().command(launcher);
            });
        }
        
        return this;
    }
};

/**
 * Device menu item with eject button
 */
function DeviceMenuItem()
{
    this._init.apply(this, arguments);
}

DeviceMenuItem.prototype =
{
    __proto__: MenuItemBase.prototype,
    
    _init: function(device, icon, text, params)
    {
        this.device = device;

        MenuItemBase.prototype._init.call(this, icon, text, params);
        
        // Add eject button
        let eject_icon = new St.Icon({ icon_name: 'media-eject-symbolic', style_class: 'popup-menu-icon' });
        let eject_button = new St.Button({ child: eject_icon });
        eject_button.connect('clicked', Lang.bind(this, this._confirmEjectDevice));
        //this.addActor(eject_button, { align: St.Align.END});
        this.addActor(eject_button, {align: St.Align.MIDDLE, span: -1});
        
        return this;
    },
    
    _confirmEjectDevice: function()
    {
        new ConfirmationDialog(Lang.bind(this, this._doEjectDevice), EJECT_DEVICE_LABEL, EJECT_DEVICE_MESSAGE, _("Cancel"), _("OK")).open();
    },
    
    _doEjectDevice: function()
    {
        this.device.remove();
    },
    
    activate: function(event)
    {
        this.device.launch({ timestamp: event.get_time() });
        PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
    }
};

/**
 * Trash menu item with empty button
 */
function TrashMenuItem()
{
    this._init.apply(this, arguments);
}

TrashMenuItem.prototype =
{
    __proto__: MenuItemBase.prototype,
    
    _init: function(trash_file, params)
    {
        this.trash_file = trash_file;
        let icon = (this._isTrashEmpty()) ? "trashcan_empty" : "trashcan_full";
        
        MenuItemBase.prototype._init.call(this, icon, _("Trash"), params);

        if (!this._isTrashEmpty()) {
            // Add empty button
            let empty_icon = new St.Icon({ icon_name: 'edit-clear-symbolic', style_class: 'popup-menu-icon' });
            let empty_button = new St.Button({ child: empty_icon });
            empty_button.connect('clicked', Lang.bind(this, this._confirmEmptyTrash));
            this.addActor(empty_button, { align: St.Align.END, span: -1 });
        }

        // Hide trash item if trash is empty
        if (settings.get_boolean('hide-empty-trash-item')) {
            if (this._isTrashEmpty()) this.actor.visible = false;
        }
        
        return this;
    },

    _isTrashEmpty: function()
    {
        let children = this.trash_file.enumerate_children('*', 0, null, null);
        if (children.next_file(null, null) == null) {
            return true;
        }
        return false;
    },
    
    _confirmEmptyTrash: function()
    {
        new ConfirmationDialog(Lang.bind(this, this._doEmptyTrash), EMPTY_TRASH_LABEL, EMPTY_TRASH_MESSAGE, _("Cancel"), _("Empty Trash")).open();
    },

    _doEmptyTrash: function()
    {
        let children = this.trash_file.enumerate_children('*', 0, null, null);
        let child_info = null;
        while ((child_info = children.next_file(null, null)) != null) {
            this.trash_file.get_child(child_info.get_name()).delete(null);
        }
    },

    activate: function(event)
    {
        new launch().file(this.trash_file.get_uri());
        PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
    }
};



/**
 * Modal confirmation dialog box
 */
function ConfirmationDialog()
{
    this._init.apply(this, arguments);
}

ConfirmationDialog.prototype =
{
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function(callback, label, message, cancel_button_label, callback_button_layer)
    {
        ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: null });

        let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout', vertical: false });
        this.contentLayout.add(mainContentBox, { x_fill: true, y_fill: true });

        let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout', vertical: true });
        mainContentBox.add(messageBox, { y_align: St.Align.START });

        this._subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline', text: label });
        messageBox.add(this._subjectLabel, { y_fill: false, y_align: St.Align.START });

        this._descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description', text: message });
        messageBox.add(this._descriptionLabel, { y_fill: true, y_align: St.Align.START });

        this.setButtons([
            {
                label: cancel_button_label,
                action: Lang.bind(this, function() {
                    this.close();
                }),
                key: Clutter.Escape
            },
            {
                label: callback_button_layer,
                action: Lang.bind(this, function() {
                    this.close();
                    callback();
                })
            }
        ]);
    }
};



/**
 * The extension class
 */
function AllInOnePlaces(orientation)
{
    this._init(orientation);
}

AllInOnePlaces.prototype =
{
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function()
    {
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'folder');

        // Monitor settings changes and refresh menu on change
        this._settingsChanged = settings.connect('changed', Lang.bind(this, this._displayOnPanel));
        this._displayOnPanel();
    },

    _onButtonPress: function(actor, event)
    {
        if (settings.get_boolean('show-settings-menu')) {
            let button = event.get_button();
            if (button == 1) {
                this._displayMenu();
            } else if (button == 3) {
                this._displaySettingsMenu();
            }
        } else {
            this._displayMenu();
        }
        return PanelMenu.Button.prototype._onButtonPress.call(this, actor, event);
    },

    _displayOnPanel: function()
    {
        let show_panel_icon;
        
        // Do not allow both icon and text to be false
        if (!settings.get_boolean('show-panel-icon') && !settings.get_boolean('show-panel-text')) {
            show_panel_icon = true;
        } else {
            show_panel_icon = settings.get_boolean('show-panel-icon');
        }
        
        // Clean up all actor's children
        this.actor.get_children().forEach(function(c) {
            c.destroy()
        });

        if (settings.get_boolean('show-panel-text')) {
            this.box = new St.BoxLayout();

            if (show_panel_icon) {
                this.icon = new St.Icon({ icon_name: 'folder-symbolic', icon_size: settings.get_int('panel-icon-size') });
                this.box.add(this.icon);
                labelClass = 'places-label-icon';
            } else {
                labelClass = 'places-label';
            }
            let text = (settings.get_string('panel-text')) ? settings.get_string('panel-text') : _("Places");
            this.label = new St.Label({ text: text, style_class: labelClass });
            this.box.add(this.label);
        
            this.actor.add_actor(this.box);
        } else {
            this.icon = new St.Icon({ icon_name: 'folder-symbolic', icon_size: settings.get_int('panel-icon-size') });
            this.actor.add_actor(this.icon);
        }
    },

    _displaySettingsMenu: function()
    {
        this.menu.removeAll();
        let icon = new St.Icon({icon_name: 'gnome-settings', icon_size: settings.get_int('item-icon-size') });
        this.settingsItem = new MenuItem(icon, _("Settings"));
        this.settingsItem.connect('activate', function(actor, event) {
            new launch().command("gnome-shell-extension-prefs " + EXTENSION_UUID);
        });
        this.menu.addMenuItem(this.settingsItem);
    },

    _displayMenu: function()
    {
        // Clean up all menu items
        this.menu.removeAll();
        this._manager = new PlaceDisplay.PlacesManager();
        
        // Show home item
        this.menu.addMenuItem(new MenuItem('user-home', _("Home Folder"), settings.get_string('file-manager')));

        //let music_folder = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC);
        //this.menu.addMenuItem(new MenuItem('folder-music', _("Music Folder"), settings.get_string('file-manager') + " \"" + music_folder.replace(" ","\ ") + "\""));

        // Show desktop item
        if (settings.get_boolean('show-desktop-item')) {
            let desktop_folder = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
            this.menu.addMenuItem(new MenuItem('user-desktop', _("Desktop"), settings.get_string('file-manager') + " \"" + desktop_folder.replace(" ","\ ") + "\""));
        }

        // Show trash item
        if (settings.get_boolean('show-trash-item')) {
            this.trash_file = Gio.file_new_for_uri("trash:///");
            
            // Monitor trash changes
            // Might be a problematic section, the following two lines were
            // commented out - Guy Addadi
            this.monitor = this.trash_file.monitor_directory(0, null, null);
            this._trashChanged = this.monitor.connect('changed', Lang.bind(this, this._refreshTrashSection));

            this._trash_section = new PopupMenu.PopupMenuSection();
            this._trash_section.addMenuItem(new TrashMenuItem(this.trash_file));
            this.menu.addMenuItem(this._trash_section);
        }

        // Show bokmarks section
        if (settings.get_boolean('show-bookmarks-section')) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            // Monitor bookmarks changes
            this._bookmarksChanged = this._manager.connect('bookmarks-updated', Lang.bind(this, this._refreshBookmarksSection));
            
            if (settings.get_boolean('collapse-bookmarks-section')) {
                this._bookmarks_section = new PopupMenu.PopupSubMenuMenuItem(_("Bookmarks"));
            } else {
                this._bookmarks_section = new PopupMenu.PopupMenuSection();
            }
            this._createBookmarksSection();
            this.menu.addMenuItem(this._bookmarks_section);            
        }
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Show computer item
        this.menu.addMenuItem(new MenuItem('computer', _("Computer"), settings.get_string('file-manager') + " computer:///"));

        // Show file system item
        if (settings.get_boolean('show-filesystem-item')) {
            this.menu.addMenuItem(new MenuItem('drive-harddisk', _("File System"), settings.get_string('file-manager') + " /"));
        }

        // Show devices section
        if (settings.get_boolean('show-devices-section')) {
            // Monitor mounts changes
            this._devicesChanged = this._manager.connect('mounts-updated', Lang.bind(this, this._refreshDevicesSection));

            if (settings.get_boolean('collapse-devices-section')) {
                this._devices_section = new PopupMenu.PopupSubMenuMenuItem(_("Removable Devices"));
            } else {
                this._devices_section = new PopupMenu.PopupMenuSection();
            }
            this._createDevicesSection();
            this.menu.addMenuItem(this._devices_section);
        }

        // Show network section
        if (settings.get_boolean('show-network-section')) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            if (settings.get_boolean('collapse-network-section')) {
                this._network_section = new PopupMenu.PopupSubMenuMenuItem(_("Network"));
            } else {
                this._network_section = new PopupMenu.PopupMenuSection();
            }
            
            let network_item = new MenuItem('network-workgroup', _("Network"), settings.get_string('file-manager') + " network:///");
            if (this._network_section.menu) { this._network_section.menu.addMenuItem(network_item) } else { this._network_section.addMenuItem(network_item) }
            let connect_item = new MenuItem('gnome-globe', _("Connect to..."), settings.get_string('connect-command'));
            if (this._network_section.menu) { this._network_section.menu.addMenuItem(connect_item) } else { this._network_section.addMenuItem(connect_item) }
            
            this.menu.addMenuItem(this._network_section);
        }

        if (settings.get_boolean('show-search-item') || settings.get_boolean('show-documents-section')) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            // Show search section
            if (settings.get_boolean('show-search-item')) {
                this.menu.addMenuItem(new MenuItem('search', _("Search"), settings.get_string('search-command')));
            }
            // Show recent documents section
            if (settings.get_boolean('show-documents-section')) {
                this.recentManager = new Gtk.RecentManager();
                
                // Monitor recent documents changes 
                this._recentChanged = this.recentManager.connect('changed', Lang.bind(this, this._refreshRecentSection));

                this._recent_section = new PopupMenu.PopupSubMenuMenuItem(_("Recent documents"));
                this._createRecentSection();
                this.menu.addMenuItem(this._recent_section);
            }
        }
        
    },

    /**
     * Disconnect all signals and call parent destroy method
     */
    destroy: function()
    {
        // Disconnecting signals
        if (this._settingsChanged) settings.disconnect(this._settingsChanged);
        if (this._trashChanged) this.monitor.disconnect(this._trashChanged);
        if (this._bookmarksChanged) this._manager.disconnect(this._bookmarksChanged);
        if (this._devicesChanged) this._manager.disconnect(this._devicesChanged);
        if (this._recentChanged) this.recentManager.disconnect(this._recentChanged);
        
        PanelMenu.SystemStatusButton.prototype.destroy.call(this);
    },
    
    /**
     * Refresh trash section
     */
    _refreshTrashSection: function()
    {
        this._trash_section.removeAll();
        this._trash_section.addMenuItem(new TrashMenuItem(this.trash_file));
    },

    /**
     * Build bookmarks section
     */
    _createBookmarksSection: function()
    {
        //this.bookmarks = this._manager.getBookmarks();
        this.bookmarks = this._manager.get('bookmarks');
        for (let bookmarkid = 0; bookmarkid < this.bookmarks.length; bookmarkid++) {
            //let icon = this.bookmarks[bookmarkid].iconFactory(settings.get_int('item-icon-size'));
            let icon = new St.Icon({gicon: this.bookmarks[bookmarkid].getIcon(), icon_name: this.bookmarks[bookmarkid].name, icon_size: settings.get_int('item-icon-size') });
            //let tmpicon= new Gio.ThemedIcon({ name: this.bookmarks[bookmarkid].name });
            //let icon = this.bookmarks[bookmarkid].getIcon();
            //let tmpicon = new St.icon({ name: 'folder-symbolic' });
            //let icon = new St.TextureCache.get_default().load_gicon(null, tmpicon, settings.get_int('item-icon-size'));
            let bookmark_item = new MenuItem(icon, this.bookmarks[bookmarkid].name);
            //let bookmark_item = new MenuItem(this.bookmarks[bookmarkid].icon, this.bookmarks[bookmarkid].name);
            bookmark_item.place = this.bookmarks[bookmarkid];
            
            bookmark_item.connect('activate', function(actor, event) {
                actor.place.launch();
            });
            if (this._bookmarks_section.menu) { this._bookmarks_section.menu.addMenuItem(bookmark_item) } else { this._bookmarks_section.addMenuItem(bookmark_item) }
        }
    },
    
    /**
     * Refresh bookmarks section
     */
    _refreshBookmarksSection: function()
    {
        if (this._bookmarks_section.menu) { this._bookmarks_section.menu.removeAll() } else { this._bookmarks_section.removeAll() }
        this._createBookmarksSection();
    },

    /**
     * Build devices section
     */
    _createDevicesSection: function()
    {
        this.devices = this._manager.get('devices');
        for (let devid = 0; devid < this.devices.length; devid++) {
            //let icon = this.devices[devid].iconFactory(settings.get_int('item-icon-size'));
            //let icon = new St.Icon({gicon: this.bookmarks[bookmarkid].getIcon(), icon_name: this.bookmarks[bookmarkid].name, icon_size: settings.get_int('item-icon-size') });
            let icon = new St.Icon({icon_name: this.devices[devid].name, icon_size: settings.get_int('item-icon-size') });
            //let bookmark_item = new MenuItem(icon, this.bookmarks[bookmarkid].name);
            let device_item = new DeviceMenuItem(this.devices[devid], icon, this.devices[devid].name);
            if (this._devices_section.menu) { this._devices_section.menu.addMenuItem(device_item) } else { this._devices_section.addMenuItem(device_item) }
        }

        if (this.devices.length == 0) {
            this._devices_section.actor.hide();
        } else {
            this._devices_section.actor.show();
        }
    },

    /**
     * Refresh devices section
     */
    _refreshDevicesSection: function()
    {
        if (this._devices_section.menu) { this._devices_section.menu.removeAll() } else { this._devices_section.removeAll() }
        this._createDevicesSection();
    },

    /**
     * Build recent documents section
     */
    _createRecentSection: function()
    {
        let id = 0;

        if (this.recentManager.size > 0) {
            let items = this.recentManager.get_items();
            while (id < settings.get_int('max-documents-documents') && id < this.recentManager.size) {
                let recent_item = new MenuItem(items[id].get_mime_type().replace("\/","-"), items[id].get_display_name());
                recent_item.connect('activate', Lang.bind(this, this._openRecentFile, items[id].get_uri()));
                this._recent_section.menu.addMenuItem(recent_item);
                id++;
            }
            
            // Clear list item
            this._recent_section.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            menuItem = new PopupMenu.PopupBaseMenuItem();
            let label = new St.Label({ text: _("Clear list") });
            menuItem.addActor(label, { align: St.Align.END});
            let icon = new St.Icon({ icon_name: 'edit-clear-symbolic', style_class: 'popup-menu-icon' });
            menuItem.addActor(icon, { align: St.Align.MIDDLE});
            menuItem.connect('activate', Lang.bind(this, this._confirmClearRecent));
            this._recent_section.menu.addMenuItem(menuItem);
        }

        if (this.recentManager.size == 0) {
            this._recent_section.actor.hide();
        } else {
            this._recent_section.actor.show();
        }
    },

    /**
     * Refresh recent documents section
     */
    _refreshRecentSection: function()
    {
        this._recent_section.menu.removeAll();
        if (this.recentManager.size == 0) {
            this._recent_section.actor.visible = false;
        } else {
            this._recent_section.actor.show();
            this._recent_section.actor.visible = true;
            this._createRecentSection();
        }
    },

    /**
     * Dialog for confirmation on recent documents cleaning
     */
    _confirmClearRecent: function()
    {
        new ConfirmationDialog(Lang.bind(this, this._doClearRecent), CLEAR_RECENT_LABEL, CLEAR_RECENT_MESSAGE, _("Cancel"), _("Clear")).open();
    },

    /**
     * Action to clear recent documents
     */
    _doClearRecent: function()
    {
        this.recentManager.purge_items();
    },

    /**
     * Open file listed on recent documents list
     */
    _openRecentFile: function(object, event, recent_file)
    {
        new launch().file(recent_file);
    },

};



/**
 * Trying to centralize code to launch files or locations using different methods.
 */
function launch() {}

launch.prototype =
{
    file: function(file)
    {
        Gio.app_info_launch_default_for_uri(file, global.create_app_launch_context());
    },
    
    command: function(location)
    {
        Main.Util.spawnCommandLine(location);
    }
}



/**
 * Go!!!!!!!
 */
function init() {}

let _indicator;

function enable()
{
    // Load settings
    try {
        settings = Lib.getSettings(Extension, SCHEMA_NAME);
    } catch(e) {
        throw new Error(_("Unable to load settings."));
    }

    _indicator = new AllInOnePlaces();

    // Icon on the Left or right panel
    if (settings.get_boolean('left-panel-menu')) {
        Main.panel.addToStatusArea('all-in-one-places', _indicator, 2, 'left');
    } else {
        Main.panel.addToStatusArea('all-in-one-places', _indicator);
    }
}

function disable() {
    _indicator.destroy();
}
