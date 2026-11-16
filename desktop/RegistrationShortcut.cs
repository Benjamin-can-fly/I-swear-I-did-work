// Windows PowerShell registration helper. A .lnk has its own property store;
// WScript.Shell alone cannot persist the toast sender or its protocol-only stub.
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class WorkLogRegistrationShortcut {
    public const string AppId = "WorkLog.Desktop";
    public const string Activator = "D80E25A9-BA91-4925-AD77-27F64E8E90C5";
    [StructLayout(LayoutKind.Sequential, Pack=4)]
    struct PropertyKey {
        public Guid Format;
        public uint Id;
        public PropertyKey(uint id) { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); Id = id; }
    }
    // The PROPVARIANT union starts at byte 8 and spans two native pointers.
    [StructLayout(LayoutKind.Sequential)]
    struct Variant { public ushort Type, Reserved1, Reserved2, Reserved3; public IntPtr Value, Unused; }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out Variant value);
        void SetValue(ref PropertyKey key, ref Variant value);
        void Commit();
    }
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class ShellLink { }
    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellLink {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr data, uint flags);
        void GetIDList(out IntPtr list); void SetIDList(IntPtr list);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int size);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetHotkey(out short key); void SetHotkey(short key);
        void GetShowCmd(out int value); void SetShowCmd(int value);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }
    [DllImport("shell32.dll", PreserveSig=false)]
    static extern void SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    static extern void SHChangeNotify(int eventId, uint flags, string path, IntPtr unused);

    public static void Changed(string path) { SHChangeNotify(0x2000, 5|0x2000, path, IntPtr.Zero); }
    public static void AssociationsChanged() { SHChangeNotify(0x08000000, 0, null, IntPtr.Zero); }
    static void PutText(IPropertyStore store, uint id, string text) {
        PropertyKey key = new PropertyKey(id); Variant value = new Variant();
        try { value.Type = 31; value.Value = Marshal.StringToCoTaskMemUni(text); store.SetValue(ref key, ref value); }
        finally { PropVariantClear(ref value); }
    }
    public static void SetWindowIcon(IntPtr window, string executable, string icon) {
        Guid iid = typeof(IPropertyStore).GUID; IPropertyStore store;
        SHGetPropertyStoreForWindow(window, ref iid, out store);
        try {
            // Set relaunch metadata before the stable AppID; Windows refreshes
            // taskbar information when the final AppID property is written.
            PutText(store, 2, "\"" + executable + "\"");
            PutText(store, 3, icon + ",0");
            PutText(store, 4, "Work Log");
            PutText(store, 5, AppId);
            store.Commit();
        } finally { Marshal.FinalReleaseComObject(store); }
    }
    public static string ReadWindowProperty(IntPtr window, uint id) {
        Guid iid = typeof(IPropertyStore).GUID; IPropertyStore store;
        SHGetPropertyStoreForWindow(window, ref iid, out store);
        try {
            PropertyKey key = new PropertyKey(id); Variant value = new Variant();
            try { store.GetValue(ref key, out value); return value.Type == 31 ? Marshal.PtrToStringUni(value.Value) : null; }
            finally { PropVariantClear(ref value); }
        } finally { Marshal.FinalReleaseComObject(store); }
    }
    public static string LinkIcon(string path) {
        object link = new ShellLink();
        try {
            ((IPersistFile)link).Load(path, 0); var icon = new StringBuilder(32768); int index;
            ((IShellLink)link).GetIconLocation(icon, icon.Capacity, out index); return icon.ToString() + "," + index;
        } finally { Marshal.FinalReleaseComObject(link); }
    }
    public static bool UpdateOwnedIcon(string path, string executable, string icon) {
        if (!File.Exists(path)) return false;
        object link = new ShellLink();
        try {
            IPersistFile file = (IPersistFile)link; file.Load(path, 2);
            IShellLink shell = (IShellLink)link; var target = new StringBuilder(32768);
            shell.GetPath(target, target.Capacity, IntPtr.Zero, 4);
            if (!String.Equals(Path.GetFullPath(target.ToString()), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase)) return false;
            var previous = new StringBuilder(32768); int index; shell.GetIconLocation(previous, previous.Capacity, out index);
            var properties = (IPropertyStore)link; PropertyKey key = new PropertyKey(5); Variant identity = new Variant(); bool sameIdentity;
            try { properties.GetValue(ref key, out identity); sameIdentity = identity.Type == 31 && Marshal.PtrToStringUni(identity.Value) == AppId; }
            finally { PropVariantClear(ref identity); }
            if (index == 0 && String.Equals(previous.ToString(), icon, StringComparison.OrdinalIgnoreCase) && sameIdentity) return false;
            shell.SetIconLocation(icon, 0); PutText(properties, 5, AppId); properties.Commit(); file.Save(path, true);
        } finally { Marshal.FinalReleaseComObject(link); }
        Changed(path); return true;
    }
    public static string[] Read(string path) {
        object link = new ShellLink();
        try {
            ((IPersistFile)link).Load(path, 0);
            IPropertyStore store = (IPropertyStore)link;
            PropertyKey appKey = new PropertyKey(5), clsKey = new PropertyKey(26);
            Variant a = new Variant(), b = new Variant();
            try {
                store.GetValue(ref appKey, out a);
                store.GetValue(ref clsKey, out b);
                return new string[]{a.Type == 31 ? Marshal.PtrToStringUni(a.Value) : null,
                    b.Type == 72 ? ((Guid)Marshal.PtrToStructure(b.Value, typeof(Guid))).ToString("D") : null};
            } finally { PropVariantClear(ref a); PropVariantClear(ref b); }
        } finally { Marshal.FinalReleaseComObject(link); }
    }
    public static void Set(string path) {
        object link = new ShellLink();
        try {
            IPersistFile file = (IPersistFile)link;
            file.Load(path, 2);
            IPropertyStore store = (IPropertyStore)link;
            PropertyKey appKey = new PropertyKey(5), clsKey = new PropertyKey(26);
            Variant a = new Variant(), b = new Variant();
            try {
                a.Type = 31; a.Value = Marshal.StringToCoTaskMemUni(AppId);
                b.Type = 72; b.Value = Marshal.AllocCoTaskMem(16);
                Marshal.StructureToPtr(new Guid(Activator), b.Value, false);
                store.SetValue(ref appKey, ref a);
                store.SetValue(ref clsKey, ref b);
                store.Commit();
                file.Save(path, true);
            } finally { PropVariantClear(ref a); PropVariantClear(ref b); }
        } finally { Marshal.FinalReleaseComObject(link); }
    }
}
